import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error plain JS module used for node-side bridge client coverage
import { createBridgeClient } from '../scripts/mcp/bridge-client.mjs'

type TestServer = {
  close: () => Promise<void>
  env: NodeJS.ProcessEnv
  tempDir: string
}

type TestServerHandler = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
) => void

async function createTestServer(handler: TestServerHandler): Promise<TestServer> {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const port = (server.address() as { port: number }).port
  const tempDir = mkdtempSync(join(tmpdir(), 'boss-helper-bridge-client-events-'))

  return {
    close: async () => {
      server.close()
      await once(server, 'close')
      rmSync(tempDir, { recursive: true, force: true })
    },
    env: {
      ...process.env,
      BOSS_HELPER_AGENT_BRIDGE_TOKEN: 'vitest-events-token',
      BOSS_HELPER_AGENT_HOST: '127.0.0.1',
      BOSS_HELPER_AGENT_PORT: String(port),
      BOSS_HELPER_AGENT_TOKEN_FILE: join(tempDir, '.boss-helper-agent-token'),
    },
    tempDir,
  }
}

let activeServer: TestServer | null = null

afterEach(async () => {
  if (activeServer) {
    await activeServer.close()
    activeServer = null
  }
})

describe('bridge client event helpers', () => {
  it('returns structured retry metadata when events history is unavailable', async () => {
    activeServer = await createTestServer((_req, res) => {
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      })
      res.end()
    })

    const client = createBridgeClient(activeServer.env)
    const result = await client.readRecentEvents({ timeoutMs: 200 })

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'events-history-unavailable',
        retryable: true,
        suggestedAction: 'retry',
      }),
    )
  })

  it('returns structured retry metadata when waiting for the next event times out', async () => {
    activeServer = await createTestServer((req, res) => {
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      })

      res.write('event: history\n')
      res.write('data: {"recent":[],"subscribers":1}\n\n')

      req.on('close', () => {
        res.end()
      })
    })

    const client = createBridgeClient(activeServer.env)
    const result = await client.waitForNextEvent({ timeoutMs: 50 })

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'event-timeout',
        retryable: true,
        suggestedAction: 'retry',
      }),
    )
  })
})