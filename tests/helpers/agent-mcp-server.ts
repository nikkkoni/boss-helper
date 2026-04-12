import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export type JsonRpcMessage = {
  error?: Record<string, unknown>
  id?: number | null
  jsonrpc?: string
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
}

type FakeBridge = {
  close: () => Promise<void>
  port: number
  requests: string[]
}

export class McpClient {
  private nextId = 1
  private buffer = Buffer.alloc(0)
  private pending = new Map<number, { reject: (error: Error) => void, resolve: (message: JsonRpcMessage) => void }>()
  private unsolicited: JsonRpcMessage[] = []
  private unsolicitedWaiters: Array<(message: JsonRpcMessage) => void> = []

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    this.child.stdout.on('data', (chunk) => this.handleStdout(chunk))
    this.child.on('exit', (code, signal) => {
      const reason = new Error(`mcp server exited unexpectedly: code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      for (const { reject } of this.pending.values()) {
        reject(reason)
      }
      this.pending.clear()
    })
  }

  nextUnsolicited() {
    const queued = this.unsolicited.shift()
    if (queued) {
      return Promise.resolve(queued)
    }

    return new Promise<JsonRpcMessage>((resolve) => {
      this.unsolicitedWaiters.push(resolve)
    })
  }

  notify(method: string, params: Record<string, unknown> = {}) {
    this.writeMessage({ jsonrpc: '2.0', method, params })
  }

  request(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++
    const promise = new Promise<JsonRpcMessage>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })

    this.writeMessage({ id, jsonrpc: '2.0', method, params })
    return promise
  }

  writeRaw(buffer: Buffer | string) {
    this.child.stdin.write(buffer)
  }

  private handleStdout(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])

    while (true) {
      const headerIndex = this.buffer.indexOf('\r\n\r\n')
      if (headerIndex === -1) {
        return
      }

      const headerText = this.buffer.slice(0, headerIndex).toString('utf8')
      const lengthHeader = headerText
        .split('\r\n')
        .find((line) => line.toLowerCase().startsWith('content-length:'))

      if (!lengthHeader) {
        throw new Error('mcp response missing content-length header')
      }

      const contentLength = Number.parseInt(lengthHeader.split(':')[1].trim(), 10)
      const messageStart = headerIndex + 4
      const messageEnd = messageStart + contentLength
      if (this.buffer.length < messageEnd) {
        return
      }

      const payload = this.buffer.slice(messageStart, messageEnd).toString('utf8')
      this.buffer = this.buffer.slice(messageEnd)
      const message = JSON.parse(payload) as JsonRpcMessage

      if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id)
        if (pending) {
          this.pending.delete(message.id)
          pending.resolve(message)
          continue
        }
      }

      const waiter = this.unsolicitedWaiters.shift()
      if (waiter) {
        waiter(message)
      } else {
        this.unsolicited.push(message)
      }
    }
  }

  private writeMessage(message: Record<string, unknown>) {
    const payload = Buffer.from(JSON.stringify(message), 'utf8')
    this.child.stdin.write(`Content-Length: ${payload.length}\r\n\r\n`)
    this.child.stdin.write(payload)
  }
}

export function buildMcpFrame(message: Record<string, unknown>, separator = '\r\n\r\n') {
  const payload = Buffer.from(JSON.stringify(message), 'utf8')
  return Buffer.concat([
    Buffer.from(`Content-Length: ${payload.length}${separator}`, 'utf8'),
    payload,
  ])
}

export async function startMcpServer(options: { maxContentLength?: number } = {}) {
  const token = `vitest-bridge-token-${randomUUID()}`
  const bridge = await createFakeBridge(token)
  const tempDir = mkdtempSync(join(tmpdir(), 'boss-helper-mcp-test-'))
  const tokenFile = join(tempDir, '.boss-helper-agent-token')
  const child = spawn(process.execPath, ['./scripts/agent-mcp-server.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BOSS_HELPER_AGENT_BRIDGE_TOKEN: token,
      BOSS_HELPER_AGENT_HOST: '127.0.0.1',
      BOSS_HELPER_AGENT_MCP_MAX_CONTENT_LENGTH: options.maxContentLength?.toString(),
      BOSS_HELPER_AGENT_PORT: String(bridge.port),
      BOSS_HELPER_AGENT_TOKEN_FILE: tokenFile,
    },
    stdio: 'pipe',
  })

  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })

  const client = new McpClient(child)
  let closed = false

  return {
    bridge,
    child,
    client,
    close: async () => {
      if (closed) {
        return
      }

      closed = true
      await terminateChild(child)
      await bridge.close()
      rmSync(tempDir, { force: true, recursive: true })
    },
    getStderr: () => stderr,
    throwWithStderr: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return new Error(`${message}\nMCP stderr:\n${stderr}`)
    },
  }
}

async function createFakeBridge(token: string): Promise<FakeBridge> {
  const requests: string[] = []
  const server = createServer(async (req, res) => {
    if (req.headers['x-boss-helper-agent-token'] !== token) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, code: 'unauthorized' }))
      return
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const readBody = async () => {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      if (chunks.length === 0) {
        return {}
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      requests.push('GET /health')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        relayConnected: true,
        eventSubscribers: 1,
        host: '127.0.0.1',
        pendingResponses: 0,
        port: 4317,
        queued: 0,
      }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      requests.push('GET /status')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        bridgeBaseUrl: 'https://127.0.0.1:4318',
        eventSubscribers: 1,
        pendingResponses: 0,
        queued: 0,
        recentEventCount: 2,
        relayConnected: true,
        relays: [
          {
            clientId: 'relay-1',
            connectedAt: '2026-04-10T00:00:00.000Z',
            extensionId: 'ext-1',
            lastSeenAt: '2026-04-10T00:00:00.000Z',
            userAgent: 'vitest',
          },
        ],
      }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/agent-events') {
      requests.push(`GET /agent-events?${url.searchParams.toString()}`)
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      })
      res.write('event: history\n')
      res.write(`data: ${JSON.stringify({
        recent: [
          { id: 'evt-1', type: 'job-pending-review', message: 'needs review' },
          { id: 'evt-2', type: 'job-succeeded', message: 'completed' },
        ],
        subscribers: 1,
      })}\n\n`)
      res.end()
      return
    }

    if (req.method === 'POST' && url.pathname === '/command') {
      const body = await readBody()
      const command = String(body.command ?? '')
      requests.push(`POST /command:${command}`)

      let payload: Record<string, unknown>
      switch (command) {
        case 'config.get':
          payload = {
            ok: true,
            code: 'config.get',
            message: 'config snapshot',
            data: {
              aiFiltering: { enabled: true },
            },
          }
          break
        case 'stats':
          payload = {
            ok: true,
            code: 'stats',
            message: 'stats snapshot',
            data: {
              today: { delivered: 2 },
              total: { delivered: 8 },
            },
          }
          break
        case 'resume.get':
          payload = {
            ok: true,
            code: 'resume.get',
            message: 'resume snapshot',
            data: {
              resumeText: 'Vue engineer with extension experience',
              userId: 'user-1',
            },
          }
          break
        case 'jobs.list':
          payload = {
            ok: true,
            code: 'jobs.list',
            message: 'jobs snapshot',
            data: {
              jobs: [
                {
                  encryptJobId: 'job-1',
                  jobName: 'Frontend Engineer',
                },
                {
                  encryptJobId: 'job-2',
                  jobName: 'Fullstack Engineer',
                },
              ],
            },
          }
          break
        case 'logs.query':
          payload = {
            ok: true,
            code: 'logs.query',
            message: 'logs snapshot',
            data: {
              items: [{ id: randomUUID(), status: 'success' }],
            },
          }
          break
        default:
          payload = {
            ok: true,
            code: command,
            message: 'ok',
            data: {},
          }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, code: 'not-found' }))
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  return {
    close: async () => {
      server.close()
      await once(server, 'close')
    },
    port: (server.address() as { port: number }).port,
    requests,
  }
}

async function terminateChild(child: ChildProcessWithoutNullStreams) {
  if (child.killed || child.exitCode != null) {
    return
  }

  child.kill()
  await once(child, 'exit')
}
