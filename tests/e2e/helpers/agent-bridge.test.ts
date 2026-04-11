import { createServer, type Server } from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'

import { pickAvailablePort, startAgentBridge } from './agent-bridge'

let occupiedServers: Server[] = []

afterEach(async () => {
  await Promise.all(
    occupiedServers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections?.()
          server.close((error) => {
            if (error) {
              reject(error)
              return
            }
            resolve()
          })
        }),
    ),
  )
  occupiedServers = []
})

async function occupyPort(port: number) {
  const server = createServer((_, res) => {
    res.writeHead(503, { Connection: 'close' })
    res.end('occupied')
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })
  occupiedServers.push(server)
}

describe('agent bridge helper', () => {
  it('skips occupied ports when picking an available bridge port pair', async () => {
    const preferredPort = 4760
    await occupyPort(preferredPort)
    await occupyPort(preferredPort + 1)

    const pickedPort = await pickAvailablePort(preferredPort)

    expect(pickedPort).toBe(preferredPort + 2)
  })

  it('fails fast with a clear startup error when the bridge port is already in use', async () => {
    const port = 4780
    await occupyPort(port)

    await expect(startAgentBridge(port)).rejects.toThrow(
      /agent bridge 启动失败[\s\S]*(EADDRINUSE|address already in use|bridge 进程提前退出)/,
    )
  })
})
