import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const tokenFile = join(repoRoot, '.boss-helper-agent-token')

type JsonRpcMessage = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: Record<string, unknown>
}

class McpClient {
  private nextId = 1
  private buffer = Buffer.alloc(0)
  private pending = new Map<number, { reject: (error: Error) => void, resolve: (message: JsonRpcMessage) => void }>()

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
        }
      }
    }
  }

  private writeMessage(message: Record<string, unknown>) {
    const payload = Buffer.from(JSON.stringify(message), 'utf8')
    this.child.stdin.write(`Content-Length: ${payload.length}\r\n\r\n`)
    this.child.stdin.write(payload)
  }
}

async function createFakeBridge(token: string) {
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

let cleanupTokenFile = false

afterEach(() => {
  if (cleanupTokenFile && existsSync(tokenFile)) {
    unlinkSync(tokenFile)
  }
  cleanupTokenFile = false
})

describe('agent mcp server', () => {
  it('exposes high-level context tool, resources and prompts for autonomous agents', async () => {
    const originalToken = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : ''
    const bridgeToken = originalToken || 'vitest-bridge-token'
    cleanupTokenFile = originalToken.length === 0

    const bridge = await createFakeBridge(bridgeToken)
    const child = spawn(process.execPath, ['./scripts/agent-mcp-server.mjs'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        BOSS_HELPER_AGENT_BRIDGE_TOKEN: bridgeToken,
        BOSS_HELPER_AGENT_HOST: '127.0.0.1',
        BOSS_HELPER_AGENT_PORT: String(bridge.port),
      },
      stdio: 'pipe',
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    const client = new McpClient(child)

    try {
      const initialize = await client.request('initialize', {
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

      client.notify('notifications/initialized')

      const tools = await client.request('tools/list')
      const toolNames = ((tools.result?.tools ?? []) as Array<{ name: string }>).map((tool) => tool.name)
      expect(toolNames).toContain('boss_helper_agent_context')

      const contextCall = await client.request('tools/call', {
        arguments: {
          include: ['resume', 'jobs', 'events', 'stats'],
          jobsLimit: 1,
        },
        name: 'boss_helper_agent_context',
      })

      const context = (contextCall.result?.structuredContent ?? {}) as Record<string, any>
      expect(context.ok).toBe(true)
      expect(context.readiness).toEqual(
        expect.objectContaining({
          bridgeOnline: true,
          pageControllable: true,
          relayConnected: true,
        }),
      )
      expect(context.summary).toEqual(
        expect.objectContaining({
          hasResume: true,
          jobsVisibleCount: 1,
          pendingReviewCount: 1,
          todayDelivered: 2,
        }),
      )
      expect(context.sections.resume.data).toEqual(
        expect.objectContaining({
          userId: 'user-1',
        }),
      )
      expect(context.sections.jobs.data.jobs).toHaveLength(1)

      const resources = await client.request('resources/list')
      const resourceUris = ((resources.result?.resources ?? []) as Array<{ uri: string }>).map((resource) => resource.uri)
      expect(resourceUris).toEqual(
        expect.arrayContaining([
          'boss-helper://guides/autonomy-workflow',
          'boss-helper://guides/review-loop',
          'boss-helper://runtime/bridge-context',
        ]),
      )

      const runtimeResource = await client.request('resources/read', {
        uri: 'boss-helper://runtime/bridge-context',
      })
      const runtimeContents = runtimeResource.result?.contents as Array<{ text: string }>
      const runtimeContext = JSON.parse(runtimeContents[0].text) as Record<string, any>
      expect(runtimeContext.readiness).toEqual(
        expect.objectContaining({
          bridgeOnline: true,
          relayConnected: true,
        }),
      )
      expect(runtimeContext.recommendedTools).toContain('boss_helper_agent_context')

      const prompts = await client.request('prompts/list')
      const promptNames = ((prompts.result?.prompts ?? []) as Array<{ name: string }>).map((prompt) => prompt.name)
      expect(promptNames).toEqual(
        expect.arrayContaining(['boss_helper_targeted_delivery', 'boss_helper_review_closure']),
      )

      const targetedPrompt = await client.request('prompts/get', {
        arguments: {
          constraints: '上海，优先稳定团队',
          goal: '寻找 Vue 前端岗位',
          keywords: 'vue,typescript,chrome extension',
        },
        name: 'boss_helper_targeted_delivery',
      })

      const promptText = ((targetedPrompt.result?.messages ?? []) as Array<{ content: { text: string } }>)[0].content.text
      expect(promptText).toContain('寻找 Vue 前端岗位')
      expect(promptText).toContain('boss_helper_agent_context')
      expect(promptText).toContain('boss_helper_jobs_review')

      expect(bridge.requests).toEqual(
        expect.arrayContaining([
          'GET /health',
          'GET /status',
          'GET /agent-events?',
          'POST /command:resume.get',
          'POST /command:jobs.list',
          'POST /command:stats',
        ]),
      )
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nMCP stderr:\n${stderr}`)
    } finally {
      await terminateChild(child)
      await bridge.close()
    }
  })
})
