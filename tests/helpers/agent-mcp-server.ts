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
  const child = spawn(process.execPath, ['./scripts/agent-mcp-server.mjs', '--no-bootstrap'], {
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
            eventsConnected: true,
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
          {
            createdAt: '2026-04-10T00:00:03.000Z',
            id: 'evt-1',
            job: {
              brandName: 'Acme',
              encryptJobId: 'job-1',
              jobName: 'Frontend Engineer',
            },
            message: 'needs review',
            type: 'job-pending-review',
          },
          {
            createdAt: '2026-04-10T00:00:04.000Z',
            detail: {
              guardrailCode: 'failure-count-auto-stop',
            },
            id: 'evt-2',
            job: {
              brandName: 'Acme',
              encryptJobId: 'job-1',
              jobName: 'Frontend Engineer',
            },
            message: 'completed',
            type: 'job-succeeded',
          },
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
              historyData: [],
              progress: {
                activeTargetJobIds: ['job-1'],
                current: 1,
                currentJob: {
                  brandName: 'Acme',
                  encryptJobId: 'job-1',
                  jobName: 'Frontend Engineer',
                  message: '处理中',
                  status: 'running',
                },
                locked: true,
                message: '投递进行中',
                page: 1,
                pageSize: 15,
                remainingTargetJobIds: ['job-1'],
                state: 'running',
                stopRequested: false,
                total: 1,
              },
              run: {
                current: {
                  activeTargetJobIds: ['job-1'],
                  analyzedJobIds: ['job-1'],
                  currentJob: {
                    brandName: 'Acme',
                    encryptJobId: 'job-1',
                    jobName: 'Frontend Engineer',
                    message: '处理中',
                    status: 'running',
                  },
                  finishedAt: null,
                  lastDecision: {
                    at: '2026-04-10T00:00:02.000Z',
                    job: {
                      brandName: 'Acme',
                      encryptJobId: 'job-1',
                      jobName: 'Frontend Engineer',
                      message: '处理中',
                      status: 'running',
                    },
                    message: '开始处理岗位: Frontend Engineer',
                    type: 'job-started',
                  },
                  lastError: null,
                  page: {
                    page: 1,
                    pageSize: 15,
                    routeKind: 'jobs',
                    url: 'https://www.zhipin.com/web/geek/jobs',
                  },
                  processedJobIds: [],
                  recovery: {
                    reason: '运行仍在当前页面上下文中。',
                    requiresPageReload: false,
                    resumable: true,
                    suggestedAction: 'continue',
                  },
                  remainingTargetJobIds: ['job-1'],
                  runId: 'run-1',
                  startedAt: '2026-04-10T00:00:00.000Z',
                  state: 'running',
                  updatedAt: '2026-04-10T00:00:02.000Z',
                },
                recent: {
                  activeTargetJobIds: ['job-1'],
                  analyzedJobIds: ['job-1'],
                  currentJob: {
                    brandName: 'Acme',
                    encryptJobId: 'job-1',
                    jobName: 'Frontend Engineer',
                    message: '处理中',
                    status: 'running',
                  },
                  finishedAt: null,
                  lastDecision: {
                    at: '2026-04-10T00:00:02.000Z',
                    job: {
                      brandName: 'Acme',
                      encryptJobId: 'job-1',
                      jobName: 'Frontend Engineer',
                      message: '处理中',
                      status: 'running',
                    },
                    message: '开始处理岗位: Frontend Engineer',
                    type: 'job-started',
                  },
                  lastError: null,
                  page: {
                    page: 1,
                    pageSize: 15,
                    routeKind: 'jobs',
                    url: 'https://www.zhipin.com/web/geek/jobs',
                  },
                  processedJobIds: [],
                  recovery: {
                    reason: '运行仍在当前页面上下文中。',
                    requiresPageReload: false,
                    resumable: true,
                    suggestedAction: 'continue',
                  },
                  remainingTargetJobIds: ['job-1'],
                  runId: 'run-1',
                  startedAt: '2026-04-10T00:00:00.000Z',
                  state: 'running',
                  updatedAt: '2026-04-10T00:00:02.000Z',
                },
              },
              risk: {
                automation: {
                  aiFilteringEnabled: true,
                  aiFilteringExternal: false,
                },
                delivery: {
                  limit: 120,
                  reached: false,
                  remainingToday: 118,
                  usedToday: 2,
                },
                guardrails: {
                  friendStatus: true,
                  notification: true,
                  sameCompanyFilter: false,
                  sameHrFilter: true,
                  useCache: false,
                },
                level: 'medium',
                observed: {
                  deliveredToday: 2,
                  processedToday: 5,
                  repeatFilteredToday: 1,
                  sessionDuplicates: {
                    communicated: 0,
                    other: 0,
                    sameCompany: 1,
                    sameHr: 0,
                  },
                },
                runtime: {
                  state: 'running',
                  stopRequested: false,
                },
                warnings: [
                  {
                    code: 'same-company-filter-disabled',
                    message: '相同公司过滤已关闭，跨岗位重复投递同公司时需要额外谨慎。',
                    severity: 'info',
                  },
                  {
                    code: 'cache-disabled',
                    message: '本地缓存已关闭，页面刷新或重载后去重与恢复信息会更依赖实时页面状态。',
                    severity: 'info',
                  },
                ],
              },
              todayData: { success: 2 },
            },
          }
          break
        case 'plan.preview':
          {
            const payloadInput = body.payload && typeof body.payload === 'object'
              ? body.payload as Record<string, unknown>
              : {}
            const targetJobIds = Array.isArray(payloadInput.jobIds)
              ? payloadInput.jobIds.map((jobId) => String(jobId)).filter(Boolean)
              : ['job-1']

          payload = {
            ok: true,
            code: 'plan-preview',
            message: 'plan preview snapshot',
            data: {
              config: {
                aiFilteringEnabled: true,
                aiFilteringExternal: false,
                aiFilteringModelReady: true,
                aiFilteringThreshold: 15,
                resetFiltered: false,
                targetJobIds,
              },
              items: [
                {
                  decision: 'needs-manual-review',
                  explain: 'preview intentionally skipped internal ai filtering',
                  issues: [
                    {
                      code: 'internal-ai-filtering-pending',
                      message: 'still needs ai filtering',
                      severity: 'info',
                      step: 'aiFiltering',
                    },
                  ],
                  job: {
                    areaDistrict: 'Pudong',
                    bossName: 'Alice',
                    bossTitle: 'HR',
                    brandName: 'Acme',
                    brandScaleName: '100-499人',
                    cityName: 'Shanghai',
                    contact: false,
                    encryptJobId: 'job-1',
                    goldHunter: false,
                    hasCard: true,
                    jobLabels: [],
                    jobName: 'Frontend Engineer',
                    salaryDesc: '20-30K',
                    skills: [],
                    status: 'wait',
                    statusMsg: '等待中',
                    welfareList: [],
                  },
                  remainingSteps: ['ai-filtering', 'apply'],
                  stage: 'ai-filtering',
                },
              ],
              summary: {
                missingInfoCount: 0,
                needsExternalReviewCount: 0,
                needsManualReviewCount: 1,
                readyCount: 0,
                scopedCount: 1,
                skipCount: 0,
                totalOnPage: 2,
                unknownTargetJobIds: [],
              },
            },
          }
          break
          }
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
        case 'readiness.get':
          payload = {
            ok: true,
            code: 'readiness',
            message: 'readiness snapshot',
            data: {
              account: {
                loggedIn: true,
                loginRequired: false,
              },
              blockers: [],
              extension: {
                initialized: true,
                panelMounted: true,
                panelWrapMounted: true,
                rootMounted: true,
                selectorHealth: {
                  checks: [],
                  ok: true,
                  summary: 'ok',
                },
              },
              page: {
                active: true,
                controllable: true,
                exists: true,
                pathname: '/web/geek/jobs',
                routeKind: 'jobs',
                supported: true,
                title: 'Boss Jobs',
                url: 'https://www.zhipin.com/web/geek/jobs',
                visible: true,
              },
              ready: true,
              risk: {
                hasBlockingModal: false,
                hasCaptcha: false,
                hasRiskWarning: false,
                signals: [],
              },
              snapshotAt: '2026-04-10T00:00:00.000Z',
              suggestedAction: 'continue',
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
                  brandName: 'Acme',
                  encryptJobId: 'job-1',
                  hasCard: false,
                  jobName: 'Frontend Engineer',
                  status: 'pending',
                },
                {
                  brandName: 'Beta',
                  encryptJobId: 'job-2',
                  hasCard: true,
                  jobName: 'Fullstack Engineer',
                  status: 'wait',
                },
              ],
              total: 2,
              totalOnPage: 2,
            },
          }
          break
        case 'jobs.current':
          payload = {
            ok: true,
            code: 'jobs-current',
            message: 'current job snapshot',
            data: {
              selected: true,
              job: {
                encryptJobId: 'job-1',
                jobName: 'Frontend Engineer',
                brandName: 'Acme',
                brandScaleName: '100-499人',
                salaryDesc: '20-30K',
                cityName: 'Shanghai',
                areaDistrict: 'Pudong',
                skills: ['Vue'],
                jobLabels: ['Vue'],
                bossName: 'Alice',
                bossTitle: 'HR',
                goldHunter: false,
                contact: false,
                welfareList: [],
                status: 'wait',
                statusMsg: '等待中',
                hasCard: true,
                postDescription: '负责前端页面开发',
                degreeName: '本科',
                experienceName: '3-5年',
                address: '上海市浦东新区张江高科',
                activeTimeDesc: '刚刚活跃',
                friendStatus: 0,
                brandIndustry: '互联网',
                gps: {
                  longitude: 121.6,
                  latitude: 31.2,
                },
              },
            },
          }
          break
        case 'jobs.refresh':
          payload = {
            ok: true,
            code: 'jobs-refresh-accepted',
            message: 'refresh accepted',
            data: {
              targetUrl: 'https://www.zhipin.com/web/geek/jobs',
            },
          }
          break
        case 'logs.query':
          payload = {
            ok: true,
            code: 'logs.query',
            message: 'logs snapshot',
            data: {
              items: [
                {
                  aiScore: {
                    accepted: false,
                    rating: 42,
                    reason: 'external review rejected',
                    source: 'external',
                  },
                  brandName: 'Acme',
                  encryptJobId: 'job-1',
                  jobName: 'Frontend Engineer',
                  message: 'external review rejected',
                  pipelineError: {
                    errorMessage: 'external review rejected',
                    errorName: 'AI筛选',
                    step: 'aiFiltering',
                  },
                  status: 'AI筛选',
                  timestamp: '2026-04-10T00:00:03.500Z',
                },
                {
                  brandName: 'Acme',
                  encryptJobId: 'job-1',
                  jobName: 'Frontend Engineer',
                  message: 'same company filtered',
                  pipelineError: {
                    errorMessage: 'same company filtered',
                    errorName: '重复沟通',
                    step: 'sameCompanyFilter',
                  },
                  status: '重复沟通',
                  timestamp: '2026-04-10T00:00:03.000Z',
                },
                {
                  brandName: 'Acme',
                  encryptJobId: 'job-1',
                  jobName: 'Frontend Engineer',
                  message: 'delivery succeeded',
                  status: '投递成功',
                  timestamp: '2026-04-10T00:00:02.500Z',
                },
              ],
              limit: 25,
              offset: 0,
              total: 3,
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
