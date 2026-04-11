import { describe, expect, it } from 'vitest'

import { buildMcpFrame, startMcpServer } from './helpers/agent-mcp-server'

describe('agent mcp server framing', () => {
  it('processes split stdin frames in order across chunk boundaries', async () => {
    const server = await startMcpServer()

    try {
      const initializeFrame = buildMcpFrame({
        id: 1,
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: { name: 'vitest', version: '1.0.0' },
          protocolVersion: '2024-11-05',
        },
      })
      const pingFrame = buildMcpFrame({
        id: 2,
        jsonrpc: '2.0',
        method: 'ping',
        params: {},
      })
      const combined = Buffer.concat([initializeFrame, pingFrame])

      server.client.writeRaw(combined.subarray(0, 17))
      server.client.writeRaw(combined.subarray(17, 63))
      server.client.writeRaw(combined.subarray(63))

      const first = await server.client.nextUnsolicited()
      const second = await server.client.nextUnsolicited()

      expect(first).toEqual(
        expect.objectContaining({
          id: 1,
          jsonrpc: '2.0',
          result: expect.objectContaining({
            serverInfo: expect.objectContaining({
              name: 'boss-helper-agent-mcp',
            }),
          }),
        }),
      )
      expect(second).toEqual(
        expect.objectContaining({
          id: 2,
          jsonrpc: '2.0',
          result: {},
        }),
      )
    } catch (error) {
      throw server.throwWithStderr(error)
    } finally {
      await server.close()
    }
  })
})
