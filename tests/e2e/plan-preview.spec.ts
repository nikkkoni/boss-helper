import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'

import { expect, test } from '@playwright/test'

import type {
  BossHelperAgentPlanPreviewData,
  BossHelperAgentResponse,
} from '../../src/message/agent'
import { McpClient } from '../helpers/agent-mcp-server'
import {
  expectRelayConnected,
  pickAvailablePort,
  runAgentCli,
  startAgentBridge,
} from './helpers/agent-bridge'
import {
  getOrCreatePage,
  launchExtensionSession,
  repoRoot,
  waitForBossHelperReady,
} from './helpers/extension'
import { fixtureJobId, registerZhipinFixtureRoutes } from './helpers/zhipin-fixture'

type LiveMcpServer = {
  client: McpClient
  close: () => Promise<void>
  getStderr: () => string
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
  const child = spawn(process.execPath, ['./scripts/agent-mcp-server.mjs', '--no-bootstrap'], {
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

test('runs plan.preview through CLI and MCP against the current built extension', async () => {
  const session = await launchExtensionSession()
  const bridgePort = await pickAvailablePort(4737)
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

    const cliPreview = await runAgentCli<BossHelperAgentResponse<BossHelperAgentPlanPreviewData>>({
      command: 'plan.preview',
      payload: {
        jobIds: [fixtureJobId],
        resetFiltered: true,
      },
      port: bridge.port,
    })

    expect(cliPreview.data).toEqual(
      expect.objectContaining({
        code: 'plan-preview',
        ok: true,
      }),
    )
    expect(cliPreview.data.data).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            decision: 'ready',
            job: expect.objectContaining({ encryptJobId: fixtureJobId }),
            remainingSteps: expect.arrayContaining(['apply']),
            stage: 'ready',
          }),
        ],
        summary: expect.objectContaining({
          readyCount: 1,
          scopedCount: 1,
          totalOnPage: 1,
        }),
      }),
    )

    mcpServer = await startLiveMcpServer({
      ...process.env,
      BOSS_HELPER_AGENT_HOST: '127.0.0.1',
      BOSS_HELPER_AGENT_PORT: String(bridge.port),
    })

    const initialize = await mcpServer.client.request('initialize', {
      capabilities: {},
      clientInfo: {
        name: 'playwright-plan-preview',
        version: '1.0.0',
      },
      protocolVersion: '2024-11-05',
    })

    expect(initialize.error).toBeUndefined()
    mcpServer.client.notify('notifications/initialized')

    const toolCall = await mcpServer.client.request('tools/call', {
      arguments: {
        jobIds: [fixtureJobId],
        resetFiltered: true,
      },
      name: 'boss_helper_plan_preview',
    })

    if (toolCall.error) {
      throw new Error(`MCP tools/call failed: ${JSON.stringify(toolCall.error)}\n${mcpServer.getStderr()}`)
    }

    const structured = toolCall.result?.structuredContent as {
      command?: string
      data?: BossHelperAgentResponse<BossHelperAgentPlanPreviewData>
      ok?: boolean
    }

    expect(structured).toEqual(
      expect.objectContaining({
        command: 'plan.preview',
        ok: true,
      }),
    )
    expect(structured.data).toEqual(
      expect.objectContaining({
        code: 'plan-preview',
        data: expect.objectContaining({
          items: [
            expect.objectContaining({
              decision: 'ready',
              job: expect.objectContaining({ encryptJobId: fixtureJobId }),
              stage: 'ready',
            }),
          ],
          summary: expect.objectContaining({
            readyCount: 1,
            scopedCount: 1,
          }),
        }),
        ok: true,
      }),
    )

    await expect(relayPage.locator('#logs')).toContainText('收到命令 plan.preview')
  } finally {
    await mcpServer?.close()
    await bridge.stop()
    await session.cleanup()
  }
})
