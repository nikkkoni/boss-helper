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

async function reservePortPairBase(startPort = 4760, endPort = 4980) {
  for (let port = startPort; port <= endPort; port += 2) {
    const basePort = await pickAvailablePort(port)
    const nextPairPort = await pickAvailablePort(basePort + 2)
    if (nextPairPort === basePort + 2) {
      return basePort
    }
  }

  throw new Error('未找到可用的测试端口对')
}

describe('agent bridge helper', () => {
  it('skips occupied ports when picking an available bridge port pair', async () => {
    const preferredPort = await reservePortPairBase()
    await occupyPort(preferredPort)
    await occupyPort(preferredPort + 1)

    const pickedPort = await pickAvailablePort(preferredPort)

    expect(pickedPort).toBe(preferredPort + 2)
  })

  it('fails fast with a clear startup error when the bridge port is already in use', async () => {
    const port = await reservePortPairBase(4780, 5000)
    await occupyPort(port)

    await expect(startAgentBridge(port)).rejects.toThrow(
      /agent bridge 启动失败[\s\S]*(EADDRINUSE|address already in use|bridge 进程提前退出)/,
    )
  })
})
