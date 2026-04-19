import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'

import { expect, type Page } from '@playwright/test'

import type {
  BossHelperAgentResponse,
  BossHelperAgentStatsData,
} from '../../../src/message/agent'
import { McpClient } from '../../helpers/agent-mcp-server'
import {
  expectRelayConnected,
  pickAvailablePort,
  runAgentCli,
  startAgentBridge,
  type AgentBridgeServer,
} from './agent-bridge'
import {
  callAgentCommand,
  getOrCreatePage,
  launchExtensionSession,
  repoRoot,
  type ExtensionSession,
  waitForBossHelperReady,
} from './extension'
import { registerZhipinFixtureRoutes } from './zhipin-fixture'

type LiveMcpServer = {
  client: McpClient
  close: () => Promise<void>
  getStderr: () => string
}

export type AgentContextSnapshot = {
  recommendations?: string[]
  sections?: {
    plan?: {
      scope?: {
        source?: string
        targetJobIds?: string[]
      }
      data?: {
        config?: {
          targetJobIds?: string[]
        }
        items?: Array<{
          decision?: string
          job?: {
            encryptJobId?: string
            jobName?: string
          }
          stage?: string
        }>
        summary?: {
          missingInfoCount?: number
          needsExternalReviewCount?: number
          needsManualReviewCount?: number
          readyCount?: number
          scopedCount?: number
          skipCount?: number
        }
      }
    }
    stats?: {
      data?: BossHelperAgentStatsData
    }
  }
  summary?: {
    currentRunId?: string | null
    hasActiveRun?: boolean
    jobsVisibleCount?: number
    recentRunState?: string | null
    resumableRun?: boolean
    pendingReviewCount?: number
  }
  workflow?: {
    candidateFocus?: {
      inspectFirst?: Array<{
        brandName?: string
        encryptJobId?: string
        hasCard?: boolean
        jobName?: string
        reason?: string
        status?: string
      }>
      loadedCardCount?: number
      visibleCount?: number
    } | null
    eventFocus?: {
      terminalTypes?: string[]
      watchTypes?: string[]
    } | null
    goal?: string
    planFocus?: {
      firstAction?: string
      inspectFirst?: Array<{
        decision?: string
        encryptJobId?: string
        jobName?: string
        stage?: string
      }>
      scope?: {
        source?: string
        targetJobIds?: string[]
      }
      summary?: {
        missingInfoCount?: number
        needsExternalReviewCount?: number
        needsManualReviewCount?: number
        readyCount?: number
        scopedCount?: number
        skipCount?: number
      }
    } | null
    recommendedTools?: string[]
    stage?: string | null
  }
}

export type RunReportSnapshot = {
  currentRun?: {
    runId?: string | null
    state?: string | null
  } | null
  recentRun?: {
    runId?: string | null
    state?: string | null
  } | null
  reviewAudit?: {
    externalReviewCount?: number
    pendingReviewCount?: number
    pendingReviewEvents?: Array<{
      encryptJobId?: string
      timestamp?: string
    }>
  }
  run?: {
    runId?: string | null
    state?: string | null
  } | null
  summary?: {
    categoryCounts?: Record<string, number>
    decisionLogCount?: number
    outcomeCounts?: Record<string, number>
    pendingReviewCount?: number
    scope?: string | null
    selectedRunId?: string | null
    selectedRunState?: string | null
  }
  decisionLog?: Array<{
    category?: string
    message?: string
    outcome?: string
    reasonCode?: string
    reference?: {
      eventType?: string
    }
    source?: string
  }>
}

export type RecentEventsSnapshot = {
  data?: {
    recent?: Array<{
      createdAt?: string
      id?: string
      message?: string
      type?: string
    }>
  }
}

type SyntheticEventAck = {
  body: Record<string, unknown>
  ok: boolean
}

type WorkflowFixtureOptions = Parameters<typeof registerZhipinFixtureRoutes>[1]

export interface WorkflowDriver {
  bridge: AgentBridgeServer
  jobsPage: Page
  relayPage: Page
  session: ExtensionSession
  applyBrokenAiFilteringConfig: () => Promise<void>
  applyStableConfig: () => Promise<void>
  callMcpTool: <T>(name: string, args?: Record<string, unknown>) => Promise<T>
  cleanup: () => Promise<void>
  pauseRunAndWaitPaused: (options?: { timeout?: number }) => Promise<{
    pause: BossHelperAgentResponse<BossHelperAgentStatsData>
    stats: BossHelperAgentResponse<BossHelperAgentStatsData>
  }>
  postSyntheticAgentEvent: (event: Record<string, unknown>) => Promise<SyntheticEventAck>
  prepareErrorRun: (options: {
    jobIds: string[]
    resetFiltered?: boolean
    timeout?: number
  }) => Promise<{
    start: BossHelperAgentResponse
    stats: BossHelperAgentResponse<BossHelperAgentStatsData>
  }>
  prepareObserveRun: (options: {
    jobIds: string[]
    resetFiltered?: boolean
    timeout?: number
  }) => Promise<BossHelperAgentResponse>
  preparePendingReviewRun: (options: {
    event: Record<string, unknown>
    jobIds: string[]
    resetFiltered?: boolean
    timeout?: number
  }) => Promise<{
    event: Record<string, unknown>
    start: BossHelperAgentResponse
    syntheticEvent: SyntheticEventAck
  }>
  primeJobDetail: (encryptJobId: string) => Promise<unknown>
  readAgentContext: (args?: {
    eventTypes?: string[]
    include?: string[]
  }) => Promise<AgentContextSnapshot>
  readCliStats: () => Promise<BossHelperAgentResponse<BossHelperAgentStatsData>>
  readRecentEvents: () => Promise<RecentEventsSnapshot>
  readRunReport: () => Promise<RunReportSnapshot>
  resumeRunAndWaitCompleted: (options?: { timeout?: number }) => Promise<{
    resume: BossHelperAgentResponse
    stats: BossHelperAgentResponse<BossHelperAgentStatsData>
  }>
  startRun: (options: {
    jobIds: string[]
    resetFiltered?: boolean
  }) => Promise<BossHelperAgentResponse>
  stopRun: () => Promise<BossHelperAgentResponse>
  waitForCurrentRunState: (state: string, options?: { timeout?: number }) => Promise<void>
  waitForRecentRunState: (state: string, options?: { timeout?: number }) => Promise<void>
  waitForWorkflowStage: (stage: string, options?: { include?: string[], timeout?: number }) => Promise<void>
}

interface WorkflowDriverOptions {
  allowEmptyJobList?: boolean
  clientName: string
  fixtureOptions?: WorkflowFixtureOptions
  preferredBridgePort?: number
}

async function stopChildProcess(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode != null) {
    return
  }

  child.kill('SIGTERM')
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 3_000)
    }),
  ])

  if (exited) {
    return
  }

  child.kill('SIGKILL')
  await once(child, 'exit')
}

async function startLiveMcpServer(env: NodeJS.ProcessEnv): Promise<LiveMcpServer> {
  const child = spawn(process.execPath, ['./scripts/agent-mcp-server.mjs'], {
    cwd: repoRoot,
    env,
    stdio: 'pipe',
  })

  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })

  return {
    client: new McpClient(child),
    close: async () => {
      await stopChildProcess(child)
    },
    getStderr: () => stderr,
  }
}

async function initializeMcpClient(mcpServer: LiveMcpServer, name: string) {
  const initialize = await mcpServer.client.request('initialize', {
    capabilities: {},
    clientInfo: {
      name,
      version: '1.0.0',
    },
    protocolVersion: '2024-11-05',
  })

  expect(initialize.error).toBeUndefined()
  mcpServer.client.notify('notifications/initialized')
}

export async function createWorkflowDriver(options: WorkflowDriverOptions): Promise<WorkflowDriver> {
  let session: ExtensionSession | undefined
  let bridge: AgentBridgeServer | undefined
  let mcpServer: LiveMcpServer | undefined

  try {
    session = await launchExtensionSession()
    const bridgePort = await pickAvailablePort(options.preferredBridgePort ?? 4757)
    bridge = await startAgentBridge(bridgePort)

    const activeBridge = bridge

    await registerZhipinFixtureRoutes(session.context, options.fixtureOptions)

    const jobsPage = await getOrCreatePage(session.context)
    await jobsPage.goto('https://www.zhipin.com/web/geek/jobs')
    await waitForBossHelperReady(jobsPage, {
      allowEmptyJobList: options.allowEmptyJobList === true,
    })

    const relayPage = await session.context.newPage()
    await relayPage.goto(`${activeBridge.httpsBaseUrl}/?extensionId=${session.extensionId}`)
    await expectRelayConnected(relayPage, activeBridge)

    mcpServer = await startLiveMcpServer({
      ...process.env,
      BOSS_HELPER_AGENT_HOST: '127.0.0.1',
      BOSS_HELPER_AGENT_PORT: String(activeBridge.port),
    })
    const activeMcpServer = mcpServer
    await initializeMcpClient(activeMcpServer, options.clientName)

    let cleanedUp = false

    const runCliCommand = async <T = Record<string, unknown>>(args: {
      allowFailure?: boolean
      command: string
      payload?: unknown
    }) => {
      return (await runAgentCli<T>({
        allowFailure: args.allowFailure,
        command: args.command,
        payload: args.payload,
        port: activeBridge.port,
      })).data
    }

    const callMcpTool = async <T>(name: string, args: Record<string, unknown> = {}) => {
      const toolCall = await activeMcpServer.client.request('tools/call', {
        arguments: args,
        name,
      })

      if (toolCall.error) {
        throw new Error(`MCP tools/call failed: ${JSON.stringify(toolCall.error)}\n${activeMcpServer.getStderr()}`)
      }

      return toolCall.result?.structuredContent as T
    }

    const readPageStats = async () => {
      return await callAgentCommand(jobsPage, 'stats') as BossHelperAgentResponse<BossHelperAgentStatsData>
    }

    const primeJobDetail = async (encryptJobId: string) => {
      return await callAgentCommand(jobsPage, 'jobs.detail', {
        encryptJobId,
      })
    }

    const readAgentContext = async (
      args: {
        eventTypes?: string[]
        include?: string[]
      } = {},
    ) => {
      return callMcpTool<AgentContextSnapshot>('boss_helper_agent_context', {
        eventTypes: args.eventTypes,
        include: args.include ?? ['events', 'stats'],
      })
    }

    const readRunReport = async () => {
      return callMcpTool<RunReportSnapshot>('boss_helper_run_report')
    }

    const readRecentEvents = async () => {
      return callMcpTool<RecentEventsSnapshot>('boss_helper_events_recent')
    }

    const readCliStats = async () => {
      return runCliCommand<BossHelperAgentResponse<BossHelperAgentStatsData>>({
        command: 'stats',
      })
    }

    const applyStableConfig = async () => {
      const response = await runCliCommand<BossHelperAgentResponse>({
        command: 'config.update',
        payload: {
          configPatch: {
            delay: {
              deliveryStarts: 0,
              deliveryInterval: 0,
              deliveryPageNext: 0,
            },
            notification: {
              value: false,
            },
            sameHrFilter: {
              value: false,
            },
          },
        },
      })

      expect(response).toEqual(
        expect.objectContaining({
          code: 'config-updated',
          ok: true,
        }),
      )
    }

    const applyBrokenAiFilteringConfig = async () => {
      const response = await runCliCommand<BossHelperAgentResponse>({
        command: 'config.update',
        payload: {
          configPatch: {
            aiFiltering: {
              enable: true,
              model: '__missing_model__',
            },
          },
        },
      })

      expect(response).toEqual(
        expect.objectContaining({
          code: 'config-updated',
          ok: true,
        }),
      )
    }

    const postSyntheticAgentEvent = async (event: Record<string, unknown>) => {
      return await relayPage.evaluate(async (payload) => {
        const response = await fetch('/agent-events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ event: payload }),
        })

        return {
          ok: response.ok,
          body: await response.json(),
        }
      }, event) as SyntheticEventAck
    }

    const waitForWorkflowStage = async (
      stage: string,
      waitOptions: { include?: string[], timeout?: number } = {},
    ) => {
      await expect.poll(async () => {
        const context = await readAgentContext({ include: waitOptions.include })
        return context.workflow?.stage ?? null
      }, {
        timeout: waitOptions.timeout ?? 10_000,
      }).toBe(stage)
    }

    const waitForCurrentRunState = async (state: string, waitOptions: { timeout?: number } = {}) => {
      await expect.poll(async () => {
        const stats = await readPageStats()
        return stats.data?.run?.current?.state ?? null
      }, {
        timeout: waitOptions.timeout ?? 10_000,
      }).toBe(state)
    }

    const waitForRecentRunState = async (state: string, waitOptions: { timeout?: number } = {}) => {
      await expect.poll(async () => {
        const stats = await readPageStats()
        return stats.data?.run?.current == null && stats.data?.run?.recent?.state === state
      }, {
        timeout: waitOptions.timeout ?? 10_000,
      }).toBe(true)
    }

    const startRun = async (startOptions: {
      jobIds: string[]
      resetFiltered?: boolean
    }) => {
      return runCliCommand<BossHelperAgentResponse>({
        command: 'start',
        payload: {
          confirmHighRisk: true,
          jobIds: startOptions.jobIds,
          resetFiltered: startOptions.resetFiltered ?? true,
        },
      })
    }

    const prepareObserveRun = async (prepareOptions: {
      jobIds: string[]
      resetFiltered?: boolean
      timeout?: number
    }) => {
      await applyStableConfig()
      const start = await startRun(prepareOptions)
      await waitForWorkflowStage('observe-run', {
        include: ['stats'],
        timeout: prepareOptions.timeout,
      })
      return start
    }

    const pauseRunAndWaitPaused = async (pauseOptions: { timeout?: number } = {}) => {
      const pause = await runCliCommand<BossHelperAgentResponse<BossHelperAgentStatsData>>({
        command: 'pause',
      })
      await waitForCurrentRunState('paused', pauseOptions)
      return {
        pause,
        stats: await readCliStats(),
      }
    }

    const resumeRunAndWaitCompleted = async (resumeOptions: { timeout?: number } = {}) => {
      const resume = await runCliCommand<BossHelperAgentResponse>({
        command: 'resume',
        payload: {
          confirmHighRisk: true,
        },
      })
      await waitForRecentRunState('completed', resumeOptions)
      return {
        resume,
        stats: await readCliStats(),
      }
    }

    const prepareErrorRun = async (prepareOptions: {
      jobIds: string[]
      resetFiltered?: boolean
      timeout?: number
    }) => {
      await applyStableConfig()
      await applyBrokenAiFilteringConfig()
      const start = await startRun(prepareOptions)
      await waitForRecentRunState('error', { timeout: prepareOptions.timeout })
      return {
        start,
        stats: await readCliStats(),
      }
    }

    const preparePendingReviewRun = async (prepareOptions: {
      event: Record<string, unknown>
      jobIds: string[]
      resetFiltered?: boolean
      timeout?: number
    }) => {
      const eventType = typeof prepareOptions.event.type === 'string' ? prepareOptions.event.type : ''
      const eventId = typeof prepareOptions.event.id === 'string' ? prepareOptions.event.id : null

      const start = await prepareObserveRun({
        jobIds: prepareOptions.jobIds,
        resetFiltered: prepareOptions.resetFiltered,
        timeout: prepareOptions.timeout,
      })

      const event = structuredClone(prepareOptions.event)
      if (typeof event.createdAt !== 'string' || !event.createdAt) {
        event.createdAt = new Date().toISOString()
      }

      const syntheticEvent = await postSyntheticAgentEvent(event)

      await expect.poll(async () => {
        const recentEvents = await readRecentEvents()
        return (recentEvents.data?.recent ?? []).some((event) => {
          if (eventId) {
            return event.id === eventId
          }

          return event.type === eventType
        })
      }, {
        timeout: prepareOptions.timeout ?? 15_000,
      }).toBe(true)

      await waitForWorkflowStage('review-loop', {
        include: ['events', 'stats'],
        timeout: prepareOptions.timeout ?? 15_000,
      })

      return {
        event,
        start,
        syntheticEvent,
      }
    }

    const stopRun = async () => {
      return runCliCommand<BossHelperAgentResponse>({
        command: 'stop',
      })
    }

    return {
      bridge: activeBridge,
      jobsPage,
      relayPage,
      session,
      applyBrokenAiFilteringConfig,
      applyStableConfig,
      callMcpTool,
      cleanup: async () => {
        if (cleanedUp) {
          return
        }

        cleanedUp = true
        await mcpServer?.close()
        await activeBridge.stop()
        await session?.cleanup()
      },
      pauseRunAndWaitPaused,
      postSyntheticAgentEvent,
      prepareErrorRun,
      prepareObserveRun,
      preparePendingReviewRun,
      primeJobDetail,
      readAgentContext,
      readCliStats,
      readRecentEvents,
      readRunReport,
      resumeRunAndWaitCompleted,
      startRun,
      stopRun,
      waitForCurrentRunState,
      waitForRecentRunState,
      waitForWorkflowStage,
    }
  } catch (error) {
    await mcpServer?.close()
    await bridge?.stop()
    await session?.cleanup()
    throw error
  }
}
