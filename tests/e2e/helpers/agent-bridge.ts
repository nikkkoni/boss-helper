import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'

import { repoRoot } from './extension'

const execFileAsync = promisify(execFile)

export interface AgentBridgeServer {
  child: ChildProcessWithoutNullStreams
  httpBaseUrl: string
  httpsBaseUrl: string
  port: number
  stop: () => Promise<void>
}

interface BridgeHealth {
  ok: boolean
  relayConnected: boolean
}

async function waitForBridgeHealth(httpBaseUrl: string): Promise<BridgeHealth> {
  let lastError: unknown

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${httpBaseUrl}/health`)
      if (response.ok) {
        return response.json()
      }
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }

  throw new Error(
    `等待 agent bridge 启动超时: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
  )
}

export async function startAgentBridge(port: number): Promise<AgentBridgeServer> {
  const httpBaseUrl = `http://127.0.0.1:${port}`
  const httpsBaseUrl = `https://127.0.0.1:${port + 1}`
  const child = spawn(process.execPath, ['./scripts/agent-bridge.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BOSS_HELPER_AGENT_HOST: '127.0.0.1',
      BOSS_HELPER_AGENT_PORT: String(port),
      BOSS_HELPER_AGENT_HTTPS_PORT: String(port + 1),
    },
    stdio: 'pipe',
  })

  const output: string[] = []
  child.stdout.on('data', (chunk) => {
    output.push(String(chunk))
  })
  child.stderr.on('data', (chunk) => {
    output.push(String(chunk))
  })

  try {
    await waitForBridgeHealth(httpBaseUrl)
  } catch (error) {
    child.kill('SIGTERM')
    throw new Error(
      `agent bridge 启动失败: ${error instanceof Error ? error.message : 'unknown error'}\n${output.join('')}`,
    )
  }

  return {
    child,
    httpBaseUrl,
    httpsBaseUrl,
    port,
    async stop() {
      if (child.exitCode != null) {
        return
      }

      child.kill('SIGTERM')
      await Promise.race([
        once(child, 'exit'),
        delay(3_000).then(() => {
          if (child.exitCode == null) {
            child.kill('SIGKILL')
          }
        }),
      ])
    },
  }
}

export async function runAgentCli<T = Record<string, unknown>>(args: {
  command: string
  payload?: unknown
  port: number
}) {
  const cliArgs = [
    './scripts/agent-cli.mjs',
    args.command,
    '--host',
    '127.0.0.1',
    '--port',
    String(args.port),
  ]

  if (args.payload !== undefined) {
    cliArgs.push('--payload', JSON.stringify(args.payload))
  }

  const result = await execFileAsync(process.execPath, cliArgs, {
    cwd: repoRoot,
    env: process.env,
  })

  return {
    ...result,
    data: JSON.parse(result.stdout) as T,
  }
}

export async function pickAvailablePort(preferredPort = 4517) {
  for (let port = preferredPort; port < preferredPort + 100; port += 2) {
    if (await isPortFree(port) && await isPortFree(port + 1)) {
      return port
    }
  }

  throw new Error('未找到可用的 agent bridge 端口')
}

async function isPortFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer()

    server.once('error', () => {
      resolve(false)
    })

    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, '127.0.0.1')
  })
}

export async function expectRelayConnected(
  page: import('@playwright/test').Page,
  bridge: Pick<AgentBridgeServer, 'httpBaseUrl'>,
) {
  await expect(page.locator('#bridgeState')).toHaveText('bridge: connected')
  await expect(page.locator('#relayState')).toContainText('idle')
  await expect(page.locator('#extensionEventsState')).toHaveText('events: connected')
  await expect
    .poll(async () => {
      const response = await page.request.get(`${bridge.httpBaseUrl}/health`)
      if (!response.ok()) {
        return null
      }
      return (await response.json()) as BridgeHealth
    })
    .toEqual(
      expect.objectContaining({
        ok: true,
        relayConnected: true,
      }),
    )
}
