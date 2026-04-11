import { describe, expect, it } from 'vitest'

import { buildMcpFrame, startMcpServer } from './helpers/agent-mcp-server'

describe('agent mcp server stdin limit', () => {
  it('rejects oversized stdin frames and continues serving later requests', async () => {
    const server = await startMcpServer({ maxContentLength: 180 })

    try {
      const oversizedFrame = buildMcpFrame({
        id: 99,
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: { name: 'vitest', version: '1.0.0' },
          protocolVersion: '2024-11-05',
          padding: 'x'.repeat(200),
        },
      })

      server.client.writeRaw(oversizedFrame)

      const oversizedResponse = await server.client.nextUnsolicited()
      expect(oversizedResponse).toEqual(
        expect.objectContaining({
          error: expect.objectContaining({
            code: -32600,
            message: 'Content-Length exceeds limit 180',
          }),
          id: null,
          jsonrpc: '2.0',
        }),
      )

      const initialize = await server.client.request('initialize', {
        capabilities: {},
        clientInfo: { name: 'vitest', version: '1.0.0' },
        protocolVersion: '2024-11-05',
      })

      expect(initialize.error).toBeUndefined()
      expect(initialize.result?.serverInfo).toEqual(
        expect.objectContaining({
          name: 'boss-helper-agent-mcp',
        }),
      )
    } catch (error) {
      throw server.throwWithStderr(error)
    } finally {
      await server.close()
    }
  })
})
