import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'

import { expect, test } from '@playwright/test'

import type {
  BossHelperAgentResponse,
  BossHelperAgentStatsData,
} from '../../src/message/agent'
import { McpClient } from '../helpers/agent-mcp-server'
import {
  expectRelayConnected,
  pickAvailablePort,
  runAgentCli,
  startAgentBridge,
} from './helpers/agent-bridge'
import {
  callAgentCommand,
  getOrCreatePage,
  launchExtensionSession,
  repoRoot,
  waitForBossHelperReady,
} from './helpers/extension'
import {
  fixtureJobDetails,
  fixtureJobId,
  fixtureJobList,
  fulfillFixtureJson,
  registerZhipinFixtureRoutes,
} from './helpers/zhipin-fixture'

type LiveMcpServer = {
  client: McpClient
  close: () => Promise<void>
  getStderr: () => string
}

type AgentContextSnapshot = {
  recommendations?: string[]
  sections?: {
    stats?: {
      data?: BossHelperAgentStatsData
    }
  }
  summary?: {
    currentRunId?: string | null
    hasActiveRun?: boolean
    recentRunState?: string | null
    resumableRun?: boolean
  }
}

type RunReportSnapshot = {
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

type RecentEventsSnapshot = {
  data?: {
    recent?: Array<{
      createdAt?: string
      message?: string
      type?: string
    }>
  }
}

function createSecondFixtureJob() {
  const job = structuredClone(fixtureJobList[0])
  return {
    ...job,
    areaDistrict: '徐汇区',
    bossName: 'Bob',
    brandName: 'Beta',
    encryptBossId: 'boss-2',
    encryptBrandId: 'brand-2',
    encryptJobId: 'job-2',
    itemId: 2,
    jobName: 'Platform Engineer',
    lid: 'lid-2',
    salaryDesc: '25-35K',
    securityId: 'security-2',
  }
}

function createSecondFixtureJobDetail() {
  const detail = structuredClone(fixtureJobDetails[fixtureJobId]) as Record<string, any>
  return {
    ...detail,
    bossInfo: {
      ...detail.bossInfo,
      brandName: 'Beta',
      name: 'Bob',
      title: '招聘顾问',
    },
    brandComInfo: {
      ...detail.brandComInfo,
      customerBrandName: 'Beta',
      encryptBrandId: 'brand-2',
      brandName: 'Beta',
    },
    jobInfo: {
      ...detail.jobInfo,
      address: '上海市徐汇区漕河泾',
      encryptAddressId: 'address-2',
      encryptId: 'job-2',
      encryptUserId: 'boss-user-2',
      jobName: 'Platform Engineer',
      positionName: 'Platform Engineer',
      salaryDesc: '25-35K',
      showSkills: ['Vue', 'Node.js'],
    },
    lid: 'lid-2',
    securityId: 'security-2',
  }
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

async function readAgentContext(mcpServer: LiveMcpServer) {
  const toolCall = await mcpServer.client.request('tools/call', {
    arguments: {
      include: ['stats'],
    },
    name: 'boss_helper_agent_context',
  })

  if (toolCall.error) {
    throw new Error(`MCP tools/call failed: ${JSON.stringify(toolCall.error)}\n${mcpServer.getStderr()}`)
  }

  return toolCall.result?.structuredContent as AgentContextSnapshot
}

async function readRunReport(mcpServer: LiveMcpServer) {
  const toolCall = await mcpServer.client.request('tools/call', {
    arguments: {},
    name: 'boss_helper_run_report',
  })

  if (toolCall.error) {
    throw new Error(`MCP tools/call failed: ${JSON.stringify(toolCall.error)}\n${mcpServer.getStderr()}`)
  }

  return toolCall.result?.structuredContent as RunReportSnapshot
}

async function readRecentEvents(mcpServer: LiveMcpServer) {
  const toolCall = await mcpServer.client.request('tools/call', {
    arguments: {},
    name: 'boss_helper_events_recent',
  })

  if (toolCall.error) {
    throw new Error(`MCP tools/call failed: ${JSON.stringify(toolCall.error)}\n${mcpServer.getStderr()}`)
  }

  return toolCall.result?.structuredContent as RecentEventsSnapshot
}

async function applyStableConfig(port: number) {
  const response = await runAgentCli<BossHelperAgentResponse>({
    command: 'config.update',
    payload: {
      configPatch: {
        delay: {
          deliveryStarts: 0,
          deliveryInterval: 0,
          deliveryPageNext: 0,
          messageSending: 0,
        },
        notification: {
          value: false,
        },
        sameHrFilter: {
          value: false,
        },
      },
    },
    port,
  })

  expect(response.data).toEqual(
    expect.objectContaining({
      code: 'config-updated',
      ok: true,
    }),
  )
}

async function applyBrokenAiFilteringConfig(port: number) {
  const response = await runAgentCli<BossHelperAgentResponse>({
    command: 'config.update',
    payload: {
      configPatch: {
        aiFiltering: {
          enable: true,
          model: '__missing_model__',
          vip: false,
        },
      },
    },
    port,
  })

  expect(response.data).toEqual(
    expect.objectContaining({
      code: 'config-updated',
      ok: true,
    }),
  )
}

async function postSyntheticAgentEvent(page: import('@playwright/test').Page, event: Record<string, unknown>) {
  return page.evaluate(async (payload) => {
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
  }, event)
}

async function readCliStats(port: number) {
  return (await runAgentCli<BossHelperAgentResponse<BossHelperAgentStatsData>>({
    command: 'stats',
    port,
  })).data
}

test('surfaces paused and completed run summaries through CLI stats and MCP context', async () => {
  const session = await launchExtensionSession()
  const bridgePort = await pickAvailablePort(4757)
  const bridge = await startAgentBridge(bridgePort)
  let mcpServer: LiveMcpServer | undefined
  let applyCount = 0

  const secondJob = createSecondFixtureJob()
  const secondJobDetail = createSecondFixtureJobDetail()

  try {
    await registerZhipinFixtureRoutes(session.context, {
      jobDetails: {
        ...structuredClone(fixtureJobDetails),
        [secondJob.encryptJobId]: secondJobDetail,
      },
      jobList: [structuredClone(fixtureJobList[0]), secondJob],
      onApply: async (route) => {
        applyCount += 1
        if (applyCount === 1) {
          await new Promise((resolve) => {
            setTimeout(resolve, 1_000)
          })
        }

        await fulfillFixtureJson(route, {
          body: {
            code: 0,
            message: 'ok',
            zpData: {
              attempt: applyCount,
            },
          },
        })
      },
    })

    const jobsPage = await getOrCreatePage(session.context)
    await jobsPage.goto('https://www.zhipin.com/web/geek/jobs')
    await waitForBossHelperReady(jobsPage)

    const relayPage = await session.context.newPage()
    await relayPage.goto(`${bridge.httpsBaseUrl}/?extensionId=${session.extensionId}`)
    await expectRelayConnected(relayPage, bridge)

    mcpServer = await startLiveMcpServer({
      ...process.env,
      BOSS_HELPER_AGENT_HOST: '127.0.0.1',
      BOSS_HELPER_AGENT_PORT: String(bridge.port),
    })
    await initializeMcpClient(mcpServer, 'playwright-run-summary-paused')

    await applyStableConfig(bridge.port)

    const start = await runAgentCli<BossHelperAgentResponse>({
      command: 'start',
      payload: {
        confirmHighRisk: true,
        jobIds: [fixtureJobId, secondJob.encryptJobId],
        resetFiltered: true,
      },
      port: bridge.port,
    })
    expect(start.data).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    const pause = await runAgentCli<BossHelperAgentResponse<BossHelperAgentStatsData>>({
      command: 'pause',
      port: bridge.port,
    })
    expect(pause.data).toEqual(
      expect.objectContaining({
        code: 'pause-requested',
        ok: true,
        data: expect.objectContaining({
          progress: expect.objectContaining({
            state: 'pausing',
          }),
          run: expect.objectContaining({
            current: expect.objectContaining({
              state: 'pausing',
            }),
          }),
        }),
      }),
    )

    await expect.poll(async () => {
      const stats = await callAgentCommand(jobsPage, 'stats') as BossHelperAgentResponse<BossHelperAgentStatsData>
      return stats.data?.run?.current?.state ?? null
    }).toBe('paused')

    const pausedStats = await readCliStats(bridge.port)
    expect(pausedStats).toEqual(
      expect.objectContaining({
        code: 'stats',
        ok: true,
      }),
    )

    const pausedRun = pausedStats.data?.run.current
    expect(pausedRun).toEqual(
      expect.objectContaining({
        processedJobIds: [fixtureJobId],
        recovery: expect.objectContaining({
          resumable: true,
          suggestedAction: 'resume',
        }),
        remainingTargetJobIds: [secondJob.encryptJobId],
        state: 'paused',
      }),
    )
    expect(pausedRun?.runId).toEqual(expect.any(String))

    const pausedContext = await readAgentContext(mcpServer)
    expect(pausedContext.summary).toEqual(
      expect.objectContaining({
        currentRunId: pausedRun?.runId,
        hasActiveRun: true,
        recentRunState: 'paused',
        resumableRun: true,
      }),
    )
    expect(pausedContext.sections?.stats?.data?.run.current).toEqual(
      expect.objectContaining({
        runId: pausedRun?.runId,
        state: 'paused',
      }),
    )

    const pausedReport = await readRunReport(mcpServer)
    expect(pausedReport.run).toEqual(
      expect.objectContaining({
        runId: pausedRun?.runId,
        state: 'paused',
      }),
    )
    expect(pausedReport.summary).toEqual(
      expect.objectContaining({
        scope: 'current',
        selectedRunId: pausedRun?.runId,
        selectedRunState: 'paused',
      }),
    )
    expect(pausedReport.summary?.decisionLogCount).toBeGreaterThan(0)
    expect((pausedReport.summary?.categoryCounts?.execution ?? 0)).toBeGreaterThan(0)
    expect((pausedReport.summary?.outcomeCounts?.delivered ?? 0)).toBeGreaterThan(0)
    expect(pausedReport.decisionLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'execution',
          outcome: 'delivered',
          source: 'event',
        }),
      ]),
    )

    const resume = await runAgentCli<BossHelperAgentResponse>({
      command: 'resume',
      payload: {
        confirmHighRisk: true,
      },
      port: bridge.port,
    })
    expect(resume.data).toEqual(
      expect.objectContaining({
        code: 'resumed',
        ok: true,
      }),
    )

    await expect.poll(async () => {
      const stats = await callAgentCommand(jobsPage, 'stats') as BossHelperAgentResponse<BossHelperAgentStatsData>
      return stats.data?.run?.current == null && stats.data?.run?.recent?.state === 'completed'
    }).toBe(true)

    const completedStats = await readCliStats(bridge.port)
    expect(completedStats.data?.run.current).toBeNull()
    expect(completedStats.data?.run.recent).toEqual(
      expect.objectContaining({
        processedJobIds: [fixtureJobId, secondJob.encryptJobId],
        recovery: expect.objectContaining({
          resumable: false,
          suggestedAction: 'continue',
        }),
        runId: pausedRun?.runId,
        state: 'completed',
      }),
    )

    const completedContext = await readAgentContext(mcpServer)
    expect(completedContext.summary).toEqual(
      expect.objectContaining({
        currentRunId: null,
        hasActiveRun: false,
        recentRunState: 'completed',
        resumableRun: false,
      }),
    )
    expect(completedContext.sections?.stats?.data?.run.recent).toEqual(
      expect.objectContaining({
        runId: pausedRun?.runId,
        state: 'completed',
      }),
    )

    const completedReport = await readRunReport(mcpServer)
    expect(completedReport.run).toEqual(
      expect.objectContaining({
        runId: pausedRun?.runId,
        state: 'completed',
      }),
    )
    expect(completedReport.summary).toEqual(
      expect.objectContaining({
        scope: 'recent',
        selectedRunId: pausedRun?.runId,
        selectedRunState: 'completed',
      }),
    )
    expect((completedReport.summary?.categoryCounts?.execution ?? 0)).toBeGreaterThan(0)
    expect((completedReport.summary?.outcomeCounts?.delivered ?? 0)).toBeGreaterThanOrEqual(2)
    expect(completedReport.decisionLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: 'delivered',
          source: 'log',
        }),
        expect.objectContaining({
          reference: expect.objectContaining({
            eventType: 'batch-completed',
          }),
          source: 'event',
        }),
      ]),
    )
  } finally {
    await mcpServer?.close()
    await bridge.stop()
    await session.cleanup()
  }
})

test('surfaces batch-error run summaries with refresh-page recovery hints', async () => {
  const session = await launchExtensionSession()
  const bridgePort = await pickAvailablePort(4777)
  const bridge = await startAgentBridge(bridgePort)
  let mcpServer: LiveMcpServer | undefined

  try {
    await registerZhipinFixtureRoutes(session.context)

    const jobsPage = await getOrCreatePage(session.context)
    await jobsPage.goto('https://www.zhipin.com/web/geek/jobs')
    await waitForBossHelperReady(jobsPage)

    const relayPage = await session.context.newPage()
    await relayPage.goto(`${bridge.httpsBaseUrl}/?extensionId=${session.extensionId}`)
    await expectRelayConnected(relayPage, bridge)

    mcpServer = await startLiveMcpServer({
      ...process.env,
      BOSS_HELPER_AGENT_HOST: '127.0.0.1',
      BOSS_HELPER_AGENT_PORT: String(bridge.port),
    })
    await initializeMcpClient(mcpServer, 'playwright-run-summary-error')

    await applyStableConfig(bridge.port)
    await applyBrokenAiFilteringConfig(bridge.port)

    const start = await runAgentCli<BossHelperAgentResponse>({
      command: 'start',
      payload: {
        confirmHighRisk: true,
        jobIds: [fixtureJobId],
        resetFiltered: true,
      },
      port: bridge.port,
    })
    expect(start.data).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    await expect.poll(async () => {
      const stats = await callAgentCommand(jobsPage, 'stats') as BossHelperAgentResponse<BossHelperAgentStatsData>
      return stats.data?.run?.current == null && stats.data?.run?.recent?.state === 'error'
    }, {
      timeout: 10_000,
    }).toBe(true)

    const errorStats = await readCliStats(bridge.port)
    expect(errorStats.data?.run.current).toBeNull()
    expect(errorStats.data?.run.recent).toEqual(
      expect.objectContaining({
        lastError: expect.objectContaining({
          message: expect.any(String),
        }),
        recovery: expect.objectContaining({
          requiresPageReload: true,
          resumable: false,
          suggestedAction: 'refresh-page',
        }),
        state: 'error',
      }),
    )

    const errorContext = await readAgentContext(mcpServer)
    expect(errorContext.summary).toEqual(
      expect.objectContaining({
        currentRunId: null,
        hasActiveRun: false,
        recentRunState: 'error',
        resumableRun: false,
      }),
    )
    expect(errorContext.sections?.stats?.data?.run.recent).toEqual(
      expect.objectContaining({
        recovery: expect.objectContaining({
          suggestedAction: 'refresh-page',
        }),
        state: 'error',
      }),
    )
    expect(errorContext.recommendations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('刷新页面'),
      ]),
    )

    const errorReport = await readRunReport(mcpServer)
    expect(errorReport.run).toEqual(
      expect.objectContaining({
        state: 'error',
      }),
    )
    expect(errorReport.summary).toEqual(
      expect.objectContaining({
        scope: 'recent',
        selectedRunState: 'error',
      }),
    )
    expect(errorReport.summary?.decisionLogCount).toBeGreaterThan(0)
    expect((errorReport.summary?.categoryCounts?.execution ?? 0)).toBeGreaterThan(0)
    expect((errorReport.summary?.outcomeCounts?.failed ?? 0)).toBeGreaterThan(0)
    expect(errorReport.decisionLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reasonCode: 'batch-error',
          source: 'event',
        }),
      ]),
    )
  } finally {
    await mcpServer?.close()
    await bridge.stop()
    await session.cleanup()
  }
})

test('surfaces pending-review audit details through MCP run report before a run is stopped', async () => {
  const session = await launchExtensionSession()
  const bridgePort = await pickAvailablePort(4797)
  const bridge = await startAgentBridge(bridgePort)
  let mcpServer: LiveMcpServer | undefined
  let applyCount = 0

  try {
    await registerZhipinFixtureRoutes(session.context, {
      onApply: async (route) => {
        applyCount += 1
        await new Promise((resolve) => {
          setTimeout(resolve, 10_000)
        })
        await fulfillFixtureJson(route, {
          body: {
            code: 0,
            message: 'ok',
            zpData: {
              attempt: applyCount,
            },
          },
        })
      },
    })

    const jobsPage = await getOrCreatePage(session.context)
    await jobsPage.goto('https://www.zhipin.com/web/geek/jobs')
    await waitForBossHelperReady(jobsPage)

    const relayPage = await session.context.newPage()
    await relayPage.goto(`${bridge.httpsBaseUrl}/?extensionId=${session.extensionId}`)
    await expectRelayConnected(relayPage, bridge)

    mcpServer = await startLiveMcpServer({
      ...process.env,
      BOSS_HELPER_AGENT_HOST: '127.0.0.1',
      BOSS_HELPER_AGENT_PORT: String(bridge.port),
    })
    await initializeMcpClient(mcpServer, 'playwright-run-report-pending-review')

    await applyStableConfig(bridge.port)

    const start = await runAgentCli<BossHelperAgentResponse>({
      command: 'start',
      payload: {
        confirmHighRisk: true,
        jobIds: [fixtureJobId],
        resetFiltered: true,
      },
      port: bridge.port,
    })
    expect(start.data).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    await expect.poll(async () => {
      const stats = await readCliStats(bridge.port)
      return stats.data?.run.current?.state ?? stats.data?.run.recent?.state ?? null
    }, {
      timeout: 10_000,
    }).toBe('running')

    const syntheticEventAt = new Date().toISOString()
    const syntheticEvent = await postSyntheticAgentEvent(relayPage, {
      createdAt: syntheticEventAt,
      detail: {
        encryptJobId: fixtureJobId,
        job: {
          encryptJobId: fixtureJobId,
          jobName: 'Frontend Engineer',
          brandName: 'Acme',
        },
        threshold: 60,
        timeoutMs: 60_000,
      },
      id: 'pending-review-e2e',
      job: {
        brandName: 'Acme',
        encryptJobId: fixtureJobId,
        jobName: 'Frontend Engineer',
      },
      message: '等待外部审核: Frontend Engineer',
      type: 'job-pending-review',
    })
    expect(syntheticEvent).toEqual(
      expect.objectContaining({
        ok: true,
        body: expect.objectContaining({
          accepted: true,
          ok: true,
        }),
      }),
    )

    await expect.poll(async () => {
      const recentEvents = await readRecentEvents(mcpServer!)
      return (recentEvents.data?.recent ?? []).some((event) => event.type === 'job-pending-review')
    }, {
      timeout: 15_000,
    }).toBe(true)

    const pendingReport = await readRunReport(mcpServer)
    expect(pendingReport.run).toEqual(
      expect.objectContaining({
        state: 'running',
      }),
    )
    expect(pendingReport.summary).toEqual(
      expect.objectContaining({
        scope: 'current',
        pendingReviewCount: 1,
        selectedRunState: 'running',
      }),
    )
    expect((pendingReport.summary?.categoryCounts?.business ?? 0)).toBeGreaterThan(0)
    expect((pendingReport.summary?.outcomeCounts?.info ?? 0)).toBeGreaterThan(0)
    expect(pendingReport.reviewAudit).toEqual(
      expect.objectContaining({
        externalReviewCount: 0,
        pendingReviewCount: 1,
        pendingReviewEvents: [
          expect.objectContaining({
            encryptJobId: fixtureJobId,
            timestamp: syntheticEventAt,
          }),
        ],
      }),
    )
    expect(pendingReport.decisionLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'business',
          outcome: 'info',
          reasonCode: 'external-review-required',
          reference: expect.objectContaining({
            eventType: 'job-pending-review',
          }),
          source: 'event',
        }),
      ]),
    )

    const stop = await runAgentCli<BossHelperAgentResponse>({
      command: 'stop',
      port: bridge.port,
    })
    expect(stop.data).toEqual(
      expect.objectContaining({
        code: 'stopped',
        ok: true,
      }),
    )

    await expect.poll(async () => {
      const stats = await callAgentCommand(jobsPage, 'stats') as BossHelperAgentResponse<BossHelperAgentStatsData>
      return stats.data?.run?.current == null && stats.data?.run?.recent?.state === 'stopped'
    }, {
      timeout: 15_000,
    }).toBe(true)
  } finally {
    await mcpServer?.close()
    await bridge.stop()
    await session.cleanup()
  }
})
