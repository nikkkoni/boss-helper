import { describe, expect, it, vi } from 'vitest'

// @ts-expect-error plain JS module used for MCP context integration coverage
import { createAgentContextService } from '../scripts/mcp/context.mjs'

describe('agent mcp context service', () => {
  it('builds a bootstrap guide that points to relay setup when the relay is disconnected', async () => {
    const commandCall = vi.fn(async (command: string, args: Record<string, unknown>) => ({
      ok: false,
      status: 503,
      command,
      data: {
        ok: false,
        code: 'relay-not-connected',
        message: '没有已连接的 relay 页面，请先打开 companion 页面并连接扩展',
        retryable: true,
        suggestedAction: 'reconnect-relay',
        args,
      },
    }))

    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            recentEventCount: 0,
            relayConnected: false,
            relays: [],
          },
        }
      }),
      commandCall,
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readBootstrapGuide()

    expect(result.summary).toEqual(
      expect.objectContaining({
        nextAction: 'open-relay',
        needsHumanAction: true,
        ready: false,
        stage: 'relay-offline',
      }),
    )
    expect(result.readiness).toEqual(
      expect.objectContaining({
        bridgeOnline: true,
        extensionIdConfigured: false,
        relayConnected: false,
      }),
    )
    expect(result.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'bridge', status: 'ready' }),
        expect.objectContaining({ action: 'open-relay', id: 'relay', status: 'missing' }),
        expect.objectContaining({ id: 'extension-id', status: 'blocked' }),
      ]),
    )
    expect(result.nextSteps).toEqual([
      '在 https://127.0.0.1:4318/ 打开 relay 页面，并保持该页面常驻。',
    ])
    expect(commandCall).toHaveBeenCalledWith('readiness.get', { waitForRelay: false })
  })

  it('fails fast when relay is disconnected and waitForRelay is omitted', async () => {
    const commandCall = vi.fn(async (command: string, args: Record<string, unknown>) => ({
      ok: false,
      status: 503,
      command,
      data: {
        ok: false,
        code: 'relay-not-connected',
        message: '没有已连接的 relay 页面，请先打开 companion 页面并连接扩展',
        retryable: true,
        suggestedAction: 'reconnect-relay',
        args,
      },
    }))

    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            recentEventCount: 0,
            relayConnected: false,
            relays: [],
          },
        }
      }),
      commandCall,
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readAgentContext()

    expect(result.recommendations).toEqual([
      'relay 未连接，先在 https://127.0.0.1:4318/ 打开 relay 页面并连接扩展。',
    ])
    expect(result.sections.readiness).toEqual(
      expect.objectContaining({
        code: 'relay-not-connected',
        retryable: true,
        suggestedAction: 'reconnect-relay',
      }),
    )
    expect(commandCall).toHaveBeenCalled()
    for (const [, args] of commandCall.mock.calls) {
      expect(args).toEqual(expect.objectContaining({ waitForRelay: false }))
    }
  })

  it('recommends inspecting risk warnings before resuming a run paused by an auto-stop guardrail', async () => {
    const commandCall = vi.fn(async (command: string) => {
      switch (command) {
        case 'readiness.get':
          return {
            ok: true,
            status: 200,
            data: {
              ready: true,
              suggestedAction: 'continue',
              blockers: [],
              page: {
                controllable: true,
                exists: true,
                routeKind: 'jobs',
                supported: true,
                url: 'https://www.zhipin.com/web/geek/jobs',
              },
              extension: {
                initialized: true,
              },
              account: {
                loggedIn: true,
                loginRequired: false,
              },
              risk: {
                hasBlockingModal: false,
                hasCaptcha: false,
                hasRiskWarning: false,
              },
            },
          }
        case 'stats':
          return {
            ok: true,
            status: 200,
            data: {
              risk: {
                delivery: {
                  limit: 120,
                  reached: false,
                  remainingToday: 119,
                },
                level: 'high',
                warnings: [
                  {
                    code: 'failure-count-auto-stop',
                    message: '当前批次累计失败达到 5 次，已自动暂停投递，请先检查最近错误后再决定是否 resume。',
                    severity: 'warn',
                  },
                ],
              },
              run: {
                current: {
                  recovery: {
                    resumable: true,
                  },
                  runId: 'run-guardrail',
                  state: 'paused',
                },
                recent: {
                  recovery: {
                    resumable: true,
                  },
                  state: 'paused',
                },
              },
              todayData: {
                success: 1,
              },
            },
          }
        default:
          return {
            ok: true,
            status: 200,
            data: {},
          }
      }
    })

    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            recentEventCount: 0,
            relayConnected: true,
            relays: [{ id: 'relay-1' }],
          },
        }
      }),
      commandCall,
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readAgentContext({ include: ['readiness', 'stats'] })

    expect(result.recommendations).toContain(
      '检测到 run run-guardrail 因安全护栏 failure-count-auto-stop 自动暂停，先检查 boss_helper_stats.risk.warnings 与 run.lastError，再决定是否 resume。',
    )
    expect(result.recommendations).not.toContain(
      '检测到暂停中的 run run-guardrail，如确认页面仍一致，可先调用 boss_helper_resume。',
    )
  })

  it('recommends stopping the current run before starting a new one when the run delivery limit is reached', async () => {
    const commandCall = vi.fn(async (command: string) => {
      switch (command) {
        case 'readiness.get':
          return {
            ok: true,
            status: 200,
            data: {
              ready: true,
              suggestedAction: 'continue',
              blockers: [],
              page: {
                controllable: true,
                exists: true,
                routeKind: 'jobs',
                supported: true,
                url: 'https://www.zhipin.com/web/geek/jobs',
              },
              extension: {
                initialized: true,
              },
              account: {
                loggedIn: true,
                loginRequired: false,
              },
              risk: {
                hasBlockingModal: false,
                hasCaptcha: false,
                hasRiskWarning: false,
              },
            },
          }
        case 'stats':
          return {
            ok: true,
            status: 200,
            data: {
              risk: {
                delivery: {
                  limit: 120,
                  reached: false,
                  remainingToday: 100,
                  remainingInRun: 0,
                  runLimit: 20,
                  runReached: true,
                  usedInRun: 20,
                },
                level: 'high',
                warnings: [
                  {
                    code: 'run-delivery-limit-reached',
                    message: '本轮投递已达到上限 20，已自动暂停投递；如需继续请先 stop 当前 run，再重新 start 新的一轮。',
                    severity: 'warn',
                  },
                ],
              },
              run: {
                current: {
                  lastError: {
                    code: 'run-delivery-limit-reached',
                  },
                  recovery: {
                    resumable: true,
                  },
                  runId: 'run-limit',
                  state: 'paused',
                },
                recent: {
                  recovery: {
                    resumable: true,
                  },
                  state: 'paused',
                },
              },
              todayData: {
                success: 20,
              },
            },
          }
        default:
          return {
            ok: true,
            status: 200,
            data: {},
          }
      }
    })

    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            recentEventCount: 0,
            relayConnected: true,
            relays: [{ id: 'relay-1' }],
          },
        }
      }),
      commandCall,
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readAgentContext({ include: ['readiness', 'stats'] })

    expect(result.recommendations).toContain(
      '检测到 run run-limit 已达到本轮投递上限 20，当前不建议 resume；如需继续请先 stop 当前 run，再重新 start 新的一轮。',
    )
    expect(result.recommendations).toContain(
      '当前 run 已达到本轮投递上限 20，如需继续请先 stop 当前 run，再重新 start 新的一轮。',
    )
  })

  it('recommends stopping the paused run when today deliveryLimit is already reached', async () => {
    const commandCall = vi.fn(async (command: string) => {
      switch (command) {
        case 'readiness.get':
          return {
            ok: true,
            status: 200,
            data: {
              ready: true,
              suggestedAction: 'continue',
              blockers: [],
              page: {
                controllable: true,
                exists: true,
                routeKind: 'jobs',
                supported: true,
                url: 'https://www.zhipin.com/web/geek/jobs',
              },
              extension: {
                initialized: true,
              },
              account: {
                loggedIn: true,
                loginRequired: false,
              },
              risk: {
                hasBlockingModal: false,
                hasCaptcha: false,
                hasRiskWarning: false,
              },
            },
          }
        case 'stats':
          return {
            ok: true,
            status: 200,
            data: {
              risk: {
                delivery: {
                  limit: 120,
                  reached: true,
                  remainingToday: 0,
                  remainingInRun: 4,
                  runLimit: 20,
                  runReached: false,
                  usedInRun: 16,
                },
                level: 'high',
                warnings: [
                  {
                    code: 'delivery-limit-reached',
                    message: '今日投递已达到上限 120，当前不应继续 start 或 resume。',
                    severity: 'warn',
                  },
                ],
              },
              run: {
                current: {
                  lastError: {
                    code: 'delivery-limit-reached',
                  },
                  recovery: {
                    resumable: true,
                  },
                  runId: 'run-daily-limit',
                  state: 'paused',
                },
                recent: {
                  recovery: {
                    resumable: true,
                  },
                  state: 'paused',
                },
              },
              todayData: {
                success: 120,
              },
            },
          }
        default:
          return {
            ok: true,
            status: 200,
            data: {},
          }
      }
    })

    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            recentEventCount: 0,
            relayConnected: true,
            relays: [{ id: 'relay-1' }],
          },
        }
      }),
      commandCall,
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readAgentContext({ include: ['readiness', 'stats'] })

    expect(result.recommendations).toContain(
      '检测到 run run-daily-limit 已触发今日 deliveryLimit 120，当前不建议 resume；如需继续请先 stop 当前 run，并等待下一个自然日或显式调整 deliveryLimit 后再重新 start。',
    )
    expect(result.recommendations).not.toContain(
      '检测到暂停中的 run run-daily-limit，如确认页面仍一致，可先调用 boss_helper_resume。',
    )
  })

  it('builds a phase 8 run report with structured decision log and review audit summary', async () => {
    const commandCall = vi.fn(async (command: string) => {
      switch (command) {
        case 'stats':
          return {
            ok: true,
            status: 200,
            data: {
              risk: {
                delivery: {
                  limit: 120,
                  reached: false,
                  remainingToday: 118,
                  remainingInRun: 19,
                  runLimit: 20,
                  runReached: false,
                  usedInRun: 1,
                },
                level: 'medium',
                warnings: [],
              },
              run: {
                current: {
                  lastDecision: {
                    at: '2026-04-14T00:00:14.000Z',
                    message: '卡片读取失败',
                    type: 'job-failed',
                  },
                  lastError: {
                    code: 'job-card-unavailable',
                    message: 'Card 信息获取失败',
                  },
                  recovery: {
                    resumable: true,
                  },
                  runId: 'run-observe',
                  startedAt: '2026-04-14T00:00:00.000Z',
                  state: 'running',
                  updatedAt: '2026-04-14T00:00:15.000Z',
                },
                recent: {
                  recovery: {
                    resumable: true,
                  },
                  runId: 'run-observe',
                  startedAt: '2026-04-14T00:00:00.000Z',
                  state: 'running',
                  updatedAt: '2026-04-14T00:00:15.000Z',
                },
              },
              todayData: {
                success: 2,
              },
            },
          }
        case 'logs.query':
          return {
            ok: true,
            status: 200,
            data: {
              items: [
                {
                  timestamp: '2026-04-14T00:00:14.000Z',
                  status: '投递出错',
                  message: 'Card 信息获取失败',
                  encryptJobId: 'job-page',
                  jobName: 'Page Failure Job',
                  brandName: 'Page Corp',
                  pipelineError: {
                    errorMessage: 'Card 信息获取失败',
                    errorName: 'UnknownError',
                    step: 'loadCard',
                  },
                },
                {
                  timestamp: '2026-04-14T00:00:13.000Z',
                  review: {
                    finalDecisionAt: '2026-04-14T00:00:13.000Z',
                    handledBy: 'external-agent',
                    source: 'external-ai-review',
                    status: 'rejected',
                    updatedAt: '2026-04-14T00:00:11.000Z',
                  },
                  status: 'AI筛选',
                  message: '外部审核未通过',
                  encryptJobId: 'job-review',
                  jobName: 'Review Job',
                  brandName: 'Review Corp',
                  aiScore: {
                    accepted: false,
                    rating: 48,
                    reason: '外部审核未通过',
                    source: 'external',
                  },
                  pipelineError: {
                    errorMessage: '外部审核未通过',
                    errorName: 'AI筛选',
                    step: 'aiFiltering',
                  },
                },
                {
                  timestamp: '2026-04-14T00:00:12.000Z',
                  status: 'AI筛选',
                  message: '没有找到AI筛选的模型',
                  encryptJobId: 'job-config',
                  jobName: 'Config Job',
                  brandName: 'Config Corp',
                  pipelineError: {
                    errorMessage: '没有找到AI筛选的模型',
                    errorName: 'AI筛选',
                    step: 'aiFiltering',
                  },
                },
                {
                  timestamp: '2026-04-14T00:00:10.000Z',
                  status: '重复沟通',
                  message: '相同公司已投递',
                  encryptJobId: 'job-risk',
                  jobName: 'Risk Job',
                  brandName: 'Risk Corp',
                  pipelineError: {
                    errorMessage: '相同公司已投递',
                    errorName: '重复沟通',
                    step: 'sameCompanyFilter',
                  },
                },
                {
                  timestamp: '2026-04-14T00:00:05.000Z',
                  status: '投递成功',
                  message: '投递成功: Success Job',
                  encryptJobId: 'job-success',
                  jobName: 'Success Job',
                  brandName: 'Success Corp',
                },
              ],
              limit: 25,
              offset: 0,
              total: 5,
            },
          }
        default:
          return {
            ok: true,
            status: 200,
            data: {},
          }
      }
    })

    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async () => ({
        ok: true,
        status: 200,
        data: {
          ok: true,
          recentEventCount: 2,
          relayConnected: true,
          relays: [{ id: 'relay-1' }],
        },
      })),
      commandCall,
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [
            {
              createdAt: '2026-04-14T00:00:11.000Z',
              id: 'evt-review',
              message: '等待外部审核',
              type: 'job-pending-review',
              job: {
                encryptJobId: 'job-review',
                jobName: 'Review Job',
                brandName: 'Review Corp',
              },
            },
            {
              createdAt: '2026-04-14T00:00:15.000Z',
              id: 'evt-limit',
              message: '累计失败达到阈值，已自动暂停',
              type: 'limit-reached',
              detail: {
                guardrailCode: 'failure-count-auto-stop',
              },
              job: {
                encryptJobId: 'job-page',
                jobName: 'Page Failure Job',
                brandName: 'Page Corp',
              },
            },
          ],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readRunReport({ eventLimit: 10, logLimit: 10 })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        code: 'run-report',
        run: expect.objectContaining({
          runId: 'run-observe',
          state: 'running',
        }),
        summary: expect.objectContaining({
          scope: 'current',
          selectedRunId: 'run-observe',
          externalReviewCount: 1,
          pendingReviewCount: 1,
          decisionLogCount: 7,
        }),
      }),
    )
    expect(result.summary.categoryCounts).toEqual(
      expect.objectContaining({
        business: 2,
        config: 1,
        execution: 1,
        page: 1,
        risk: 2,
        system: 0,
      }),
    )
    expect(result.summary.outcomeCounts).toEqual(
      expect.objectContaining({
        delivered: 1,
        failed: 1,
        info: 1,
        interrupted: 1,
        skipped: 3,
      }),
    )
    expect(result.decisionLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'config',
          outcome: 'skipped',
          reasonCode: 'ai-filtering-model-missing',
          source: 'log',
        }),
        expect.objectContaining({
          category: 'risk',
          outcome: 'skipped',
          reasonCode: 'duplicate-same-company',
          source: 'log',
        }),
        expect.objectContaining({
          category: 'page',
          outcome: 'failed',
          reasonCode: 'job-card-unavailable',
          source: 'log',
        }),
        expect.objectContaining({
          category: 'risk',
          outcome: 'interrupted',
          reasonCode: 'failure-count-auto-stop',
          source: 'event',
        }),
      ]),
    )
    expect(result.reviewAudit).toEqual(
      expect.objectContaining({
        externalReviewCount: 1,
        pendingReviewCount: 1,
      }),
    )
    expect(result.reviewAudit.externalReviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accepted: false,
          encryptJobId: 'job-review',
          finalDecisionAt: '2026-04-14T00:00:13.000Z',
          handledBy: 'external-agent',
          queueDepth: null,
          queueOverflowLimit: null,
          reasonCode: 'external-review-rejected',
          replacementCause: null,
          replacementRunId: null,
          rating: 48,
          source: 'external-ai-review',
          timeoutMs: null,
          timeoutSource: null,
        }),
      ]),
    )
    expect(result.reviewAudit.pendingReviewEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          queueDepth: null,
          queueOverflowLimit: null,
          reasonCode: 'external-review-pending',
          replacementRunId: null,
          reviewSource: null,
          source: expect.stringMatching(/event|log/),
          timeoutMs: null,
        }),
      ]),
    )
    expect(result.recommendations).toEqual(
      expect.arrayContaining([
        '报告中存在配置类阻塞，先复核模型、地图或相关运行配置，再决定是否重试。',
        '报告中存在页面类失败，优先刷新 Boss 页面并重新读取 readiness。',
        '报告显示本轮命中过风险护栏或速率限制，继续执行前先复核 risk.warnings 与 run.lastError。',
        '报告显示仍有 1 个待审核事件，优先完成 job-pending-review -> boss_helper_jobs_review 闭环。',
      ]),
    )
  })

  it('prefers structured audit fields from logs.query when building run report', async () => {
    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async () => ({
        ok: true,
        status: 200,
        data: {
          ok: true,
          relayConnected: true,
          relays: [{ id: 'relay-1' }],
        },
      })),
      commandCall: vi.fn(async (command: string) => {
        switch (command) {
          case 'stats':
            return {
              ok: true,
              status: 200,
              data: {
                risk: {
                  delivery: {
                    limit: 120,
                    reached: false,
                    remainingToday: 120,
                    remainingInRun: 20,
                    runLimit: 20,
                    runReached: false,
                    usedInRun: 0,
                  },
                  level: 'low',
                  warnings: [],
                },
                run: {
                  current: {
                    recovery: {
                      resumable: true,
                    },
                    runId: 'run-structured-audit',
                    startedAt: '2026-04-14T00:00:00.000Z',
                    state: 'running',
                    updatedAt: '2026-04-14T00:00:02.000Z',
                  },
                  recent: null,
                },
                todayData: {
                  success: 0,
                },
              },
            }
          case 'logs.query':
            return {
              ok: true,
              status: 200,
              data: {
                items: [
                  {
                    audit: {
                      category: 'page',
                      outcome: 'failed',
                      reasonCode: 'structured-log-audit',
                    },
                    brandName: 'Acme',
                    encryptJobId: 'job-audit',
                    jobName: 'Audit Job',
                    message: 'this message would otherwise look successful',
                    runId: 'run-from-log-entry',
                    status: '投递成功',
                    timestamp: '2026-04-14T00:00:01.000Z',
                  },
                ],
                limit: 10,
                offset: 0,
                total: 1,
              },
            }
          default:
            return {
              ok: true,
              status: 200,
              data: {},
            }
        }
      }),
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readRunReport({ eventLimit: 5, logLimit: 5 })

    expect(result.decisionLog).toEqual([
      expect.objectContaining({
        category: 'page',
        outcome: 'failed',
        reasonCode: 'structured-log-audit',
        runId: 'run-from-log-entry',
        source: 'log',
      }),
    ])
    expect(result.summary.categoryCounts.page).toBe(1)
    expect(result.summary.outcomeCounts.failed).toBe(1)
  })

  it('builds a review-loop workflow when pending review events exist', async () => {
    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            relayConnected: true,
            relays: [{ id: 'relay-1' }],
          },
        }
      }),
      commandCall: vi.fn(async (command: string) => {
        switch (command) {
          case 'readiness.get':
            return {
              ok: true,
              status: 200,
              data: {
                ready: true,
                suggestedAction: 'continue',
                blockers: [],
                page: {
                  controllable: true,
                  exists: true,
                  routeKind: 'jobs',
                  supported: true,
                  url: 'https://www.zhipin.com/web/geek/jobs',
                },
                extension: {
                  initialized: true,
                },
                account: {
                  loggedIn: true,
                  loginRequired: false,
                },
                risk: {
                  hasBlockingModal: false,
                  hasCaptcha: false,
                  hasRiskWarning: false,
                },
              },
            }
          case 'stats':
            return {
              ok: true,
              status: 200,
              data: {
                risk: {
                  delivery: {
                    limit: 120,
                    reached: false,
                    remainingToday: 120,
                  },
                  level: 'medium',
                  warnings: [],
                },
                run: {
                  current: null,
                  recent: null,
                },
                todayData: {
                  success: 0,
                },
              },
            }
          default:
            return {
              ok: true,
              status: 200,
              data: {},
            }
        }
      }),
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [
            {
              createdAt: '2026-04-15T00:00:10.000Z',
              message: '等待外部审核',
              type: 'job-pending-review',
            },
          ],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readAgentContext({ include: ['readiness', 'events', 'stats'] })

    expect(result.workflow).toEqual(
      expect.objectContaining({
        stage: 'review-loop',
        eventFocus: {
          terminalTypes: ['limit-reached', 'batch-error', 'batch-completed'],
          watchTypes: ['job-pending-review', 'limit-reached', 'batch-error', 'batch-completed'],
        },
        goal: '优先完成待审核闭环',
        recommendedTools: expect.arrayContaining(['boss_helper_jobs_review', 'boss_helper_jobs_detail']),
      }),
    )
  })

  it('builds an observe-run workflow when an active run is already running', async () => {
    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            relayConnected: true,
            relays: [{ id: 'relay-1' }],
          },
        }
      }),
      commandCall: vi.fn(async (command: string) => {
        switch (command) {
          case 'readiness.get':
            return {
              ok: true,
              status: 200,
              data: {
                ready: true,
                suggestedAction: 'continue',
                blockers: [],
                page: {
                  controllable: true,
                  exists: true,
                  routeKind: 'jobs',
                  supported: true,
                  url: 'https://www.zhipin.com/web/geek/jobs',
                },
                extension: {
                  initialized: true,
                },
                account: {
                  loggedIn: true,
                  loginRequired: false,
                },
                risk: {
                  hasBlockingModal: false,
                  hasCaptcha: false,
                  hasRiskWarning: false,
                },
              },
            }
          case 'stats':
            return {
              ok: true,
              status: 200,
              data: {
                risk: {
                  delivery: {
                    limit: 120,
                    reached: false,
                    remainingToday: 118,
                  },
                  level: 'medium',
                  warnings: [],
                },
                run: {
                  current: {
                    runId: 'run-active',
                    state: 'running',
                  },
                  recent: null,
                },
                todayData: {
                  success: 2,
                },
              },
            }
          default:
            return {
              ok: true,
              status: 200,
              data: {},
            }
        }
      }),
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readAgentContext({ include: ['readiness', 'stats'] })

    expect(result.workflow).toEqual(
      expect.objectContaining({
        stage: 'observe-run',
        eventFocus: {
          terminalTypes: ['limit-reached', 'batch-error', 'batch-completed'],
          watchTypes: [
            'job-pending-review',
            'limit-reached',
            'batch-error',
            'batch-completed',
            'rate-limited',
            'job-failed',
            'job-succeeded',
            'job-filtered',
          ],
        },
        goal: '优先观察进行中的 run',
        recommendedTools: expect.arrayContaining(['boss_helper_stats', 'boss_helper_events_recent', 'boss_helper_wait_for_event']),
      }),
    )
  })

  it('builds a resume-run workflow when a paused run is resumable', async () => {
    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            relayConnected: true,
            relays: [{ id: 'relay-1' }],
          },
        }
      }),
      commandCall: vi.fn(async (command: string) => {
        switch (command) {
          case 'readiness.get':
            return {
              ok: true,
              status: 200,
              data: {
                ready: true,
                suggestedAction: 'continue',
                blockers: [],
                page: {
                  controllable: true,
                  exists: true,
                  routeKind: 'jobs',
                  supported: true,
                  url: 'https://www.zhipin.com/web/geek/jobs',
                },
                extension: {
                  initialized: true,
                },
                account: {
                  loggedIn: true,
                  loginRequired: false,
                },
                risk: {
                  hasBlockingModal: false,
                  hasCaptcha: false,
                  hasRiskWarning: false,
                },
              },
            }
          case 'stats':
            return {
              ok: true,
              status: 200,
              data: {
                risk: {
                  delivery: {
                    limit: 120,
                    reached: false,
                    remainingToday: 118,
                    remainingInRun: 17,
                    runLimit: 20,
                    runReached: false,
                    usedInRun: 3,
                  },
                  level: 'medium',
                  warnings: [],
                },
                run: {
                  current: {
                    lastError: {
                      code: 'manual-pause',
                    },
                    recovery: {
                      resumable: true,
                    },
                    runId: 'run-paused',
                    state: 'paused',
                  },
                  recent: {
                    recovery: {
                      resumable: true,
                    },
                    runId: 'run-paused',
                    state: 'paused',
                  },
                },
                todayData: {
                  success: 2,
                },
              },
            }
          default:
            return {
              ok: true,
              status: 200,
              data: {},
            }
        }
      }),
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readAgentContext({ include: ['readiness', 'stats'] })

    expect(result.workflow).toEqual(
      expect.objectContaining({
        stage: 'resume-run',
        goal: '判断是否安全恢复当前 paused run',
        nextActions: ['先复核 risk.warnings 与 lastError，再决定是否调用 resume。'],
        recommendedTools: expect.arrayContaining([
          'boss_helper_stats',
          'boss_helper_run_report',
          'boss_helper_resume',
          'boss_helper_stop',
        ]),
      }),
    )
  })

  it('builds a recover-error workflow when the recent run ended with error', async () => {
    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            relayConnected: true,
            relays: [{ id: 'relay-1' }],
          },
        }
      }),
      commandCall: vi.fn(async (command: string) => {
        switch (command) {
          case 'readiness.get':
            return {
              ok: true,
              status: 200,
              data: {
                ready: true,
                suggestedAction: 'continue',
                blockers: [],
                page: {
                  controllable: true,
                  exists: true,
                  routeKind: 'jobs',
                  supported: true,
                  url: 'https://www.zhipin.com/web/geek/jobs',
                },
                extension: {
                  initialized: true,
                },
                account: {
                  loggedIn: true,
                  loginRequired: false,
                },
                risk: {
                  hasBlockingModal: false,
                  hasCaptcha: false,
                  hasRiskWarning: false,
                },
              },
            }
          case 'stats':
            return {
              ok: true,
              status: 200,
              data: {
                risk: {
                  delivery: {
                    limit: 120,
                    reached: false,
                    remainingToday: 120,
                  },
                  level: 'medium',
                  warnings: [],
                },
                run: {
                  current: null,
                  recent: {
                    lastError: {
                      code: 'batch-error',
                    },
                    recovery: {
                      requiresPageReload: true,
                      resumable: false,
                      suggestedAction: 'refresh-page',
                    },
                    runId: 'run-error',
                    state: 'error',
                  },
                },
                todayData: {
                  success: 1,
                },
              },
            }
          default:
            return {
              ok: true,
              status: 200,
              data: {},
            }
        }
      }),
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readAgentContext({ include: ['readiness', 'stats'] })

    expect(result.workflow).toEqual(
      expect.objectContaining({
        stage: 'recover-error',
        goal: '先定位上一轮错误，再决定是否继续',
        nextActions: ['先看 run_report 和 readiness，确认是页面、配置、系统还是风险中断。'],
        recommendedTools: expect.arrayContaining([
          'boss_helper_run_report',
          'boss_helper_stats',
          'boss_helper_jobs_refresh',
        ]),
      }),
    )
  })

  it('scopes agent_context plan preview to the currently selected job when available', async () => {
    const commandCall = vi.fn(async (command: string, args: Record<string, unknown>) => {
      switch (command) {
        case 'readiness.get':
          return {
            ok: true,
            status: 200,
            data: {
              ready: true,
              suggestedAction: 'continue',
              blockers: [],
              page: {
                controllable: true,
                exists: true,
                routeKind: 'jobs',
                supported: true,
                url: 'https://www.zhipin.com/web/geek/jobs',
              },
              extension: {
                initialized: true,
              },
              account: {
                loggedIn: true,
                loginRequired: false,
              },
              risk: {
                hasBlockingModal: false,
                hasCaptcha: false,
                hasRiskWarning: false,
              },
            },
          }
        case 'jobs.current':
          return {
            ok: true,
            status: 200,
            data: {
              selected: true,
              job: {
                brandName: 'Selected Corp',
                encryptJobId: 'job-selected',
                hasCard: true,
                jobName: 'Selected Engineer',
                status: 'wait',
              },
            },
          }
        case 'jobs.list':
          return {
            ok: true,
            status: 200,
            data: {
              jobs: [
                {
                  brandName: 'Selected Corp',
                  encryptJobId: 'job-selected',
                  hasCard: true,
                  jobName: 'Selected Engineer',
                  status: 'wait',
                },
                {
                  brandName: 'Other Corp',
                  encryptJobId: 'job-other',
                  hasCard: false,
                  jobName: 'Other Engineer',
                  status: 'pending',
                },
              ],
            },
          }
        case 'plan.preview': {
          const jobIds = Array.isArray(args.jobIds) ? args.jobIds.map((jobId: unknown) => String(jobId)) : []
          return {
            ok: true,
            status: 200,
            data: {
              config: {
                targetJobIds: jobIds,
              },
              items: [
                {
                  decision: 'needs-manual-review',
                  job: {
                    encryptJobId: jobIds[0] ?? 'job-selected',
                    jobName: 'Selected Engineer',
                  },
                  stage: 'ai-filtering',
                },
              ],
              summary: {
                missingInfoCount: 0,
                needsExternalReviewCount: 0,
                needsManualReviewCount: 1,
                readyCount: 0,
                scopedCount: jobIds.length,
                skipCount: 0,
                totalOnPage: 2,
                unknownTargetJobIds: [],
              },
            },
          }
        }
        case 'stats':
          return {
            ok: true,
            status: 200,
            data: {
              risk: {
                delivery: {
                  limit: 120,
                  reached: false,
                  remainingToday: 120,
                },
                level: 'low',
                warnings: [],
              },
              run: {
                current: null,
                recent: null,
              },
              todayData: {
                success: 0,
              },
            },
          }
        default:
          return {
            ok: true,
            status: 200,
            data: {},
          }
      }
    })

    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            relayConnected: true,
            relays: [{ id: 'relay-1' }],
          },
        }
      }),
      commandCall,
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readAgentContext({ include: ['readiness', 'jobs', 'plan', 'stats'] })

    expect(commandCall).toHaveBeenCalledWith(
      'jobs.current',
      expect.objectContaining({ includeDetail: false, waitForRelay: false }),
    )
    expect(commandCall).toHaveBeenCalledWith(
      'plan.preview',
      expect.objectContaining({ jobIds: ['job-selected'], waitForRelay: false }),
    )
    expect(result.sections.plan).toEqual(
      expect.objectContaining({
        scope: {
          source: 'selected-current-job',
          targetJobIds: ['job-selected'],
        },
        data: expect.objectContaining({
          config: expect.objectContaining({
            targetJobIds: ['job-selected'],
          }),
          summary: expect.objectContaining({
            scopedCount: 1,
          }),
        }),
      }),
    )
    expect(result.workflow.planFocus).toEqual(
      expect.objectContaining({
        scope: {
          source: 'selected-current-job',
          targetJobIds: ['job-selected'],
        },
      }),
    )
  })

  it('builds an analyze-jobs workflow when visible jobs are available and no run is active', async () => {
    const commandCall = vi.fn(async (command: string, _args: Record<string, unknown>) => {
      switch (command) {
        case 'readiness.get':
          return {
            ok: true,
            status: 200,
            data: {
              ready: true,
              suggestedAction: 'continue',
              blockers: [],
              page: {
                controllable: true,
                exists: true,
                routeKind: 'jobs',
                supported: true,
                url: 'https://www.zhipin.com/web/geek/jobs',
              },
              extension: {
                initialized: true,
              },
              account: {
                loggedIn: true,
                loginRequired: false,
              },
              risk: {
                hasBlockingModal: false,
                hasCaptcha: false,
                hasRiskWarning: false,
              },
            },
          }
        case 'jobs.list':
          return {
            ok: true,
            status: 200,
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
                  status: 'pending',
                },
                {
                  brandName: 'Gamma',
                  encryptJobId: 'job-3',
                  hasCard: false,
                  jobName: 'Platform Engineer',
                  status: 'wait',
                },
              ],
            },
          }
        case 'jobs.current':
          return {
            ok: true,
            status: 200,
            data: {
              job: null,
              selected: false,
            },
          }
        case 'stats':
          return {
            ok: true,
            status: 200,
            data: {
              risk: {
                delivery: {
                  limit: 120,
                  reached: false,
                  remainingToday: 120,
                },
                level: 'low',
                warnings: [],
              },
              run: {
                current: null,
                recent: null,
              },
              todayData: {
                success: 0,
              },
            },
          }
        case 'plan.preview':
          return {
            ok: true,
            status: 200,
            data: {
              items: [
                {
                  decision: 'needs-manual-review',
                  job: {
                    encryptJobId: 'job-2',
                    jobName: 'Fullstack Engineer',
                  },
                  stage: 'ai-filtering',
                },
                {
                  decision: 'missing-info',
                  job: {
                    encryptJobId: 'job-3',
                    jobName: 'Platform Engineer',
                  },
                  stage: 'load-card',
                },
              ],
              summary: {
                missingInfoCount: 1,
                needsExternalReviewCount: 0,
                needsManualReviewCount: 1,
                readyCount: 0,
                scopedCount: 3,
                skipCount: 1,
                totalOnPage: 3,
                unknownTargetJobIds: [],
              },
            },
          }
        case 'resume.get':
          return {
            ok: true,
            status: 200,
            data: {
              resumeText: 'Vue engineer',
              userId: 'user-1',
            },
          }
        default:
          return {
            ok: true,
            status: 200,
            data: {},
          }
      }
    })

    const service = createAgentContextService({
      baseUrl: 'http://127.0.0.1:4317',
      bridgeRuntime: {
        host: '127.0.0.1',
        httpsBaseUrl: 'https://127.0.0.1:4318',
        httpsPort: 4318,
        port: 4317,
      },
      bridgeGet: vi.fn(async (path: string) => {
        if (path === '/health') {
          return {
            ok: true,
            status: 200,
            data: { ok: true },
          }
        }

        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            relayConnected: true,
            relays: [{ id: 'relay-1' }],
          },
        }
      }),
      commandCall,
      readRecentEvents: vi.fn(async () => ({
        ok: true,
        data: {
          recent: [],
          subscribers: 1,
        },
      })),
    })

    const result = await service.readAgentContext({ include: ['readiness', 'jobs', 'plan', 'resume', 'stats'] })

    expect(result.workflow).toEqual(
      expect.objectContaining({
        stage: 'analyze-jobs',
        candidateFocus: {
          inspectFirst: [
            {
              brandName: 'Beta',
              encryptJobId: 'job-2',
              hasCard: true,
              jobName: 'Fullstack Engineer',
              reason: 'loaded-card',
              status: 'pending',
            },
            {
              brandName: 'Acme',
              encryptJobId: 'job-1',
              hasCard: false,
              jobName: 'Frontend Engineer',
              reason: 'list-order',
              status: 'pending',
            },
            {
              brandName: 'Gamma',
              encryptJobId: 'job-3',
              hasCard: false,
              jobName: 'Platform Engineer',
              reason: 'list-order',
              status: 'wait',
            },
          ],
          loadedCardCount: 1,
          visibleCount: 3,
        },
        planFocus: {
          firstAction: 'inspect-manual-review',
          inspectFirst: [
            {
              decision: 'needs-manual-review',
              encryptJobId: 'job-2',
              jobName: 'Fullstack Engineer',
              stage: 'ai-filtering',
            },
            {
              decision: 'missing-info',
              encryptJobId: 'job-3',
              jobName: 'Platform Engineer',
              stage: 'load-card',
            },
          ],
          scope: {
            source: 'candidate-focus',
            targetJobIds: ['job-2', 'job-1', 'job-3'],
          },
          summary: {
            missingInfoCount: 1,
            needsExternalReviewCount: 0,
            needsManualReviewCount: 1,
            readyCount: 0,
            scopedCount: 3,
            skipCount: 1,
          },
        },
        goal: '先做小范围岗位分析与只读预演',
        recommendedTools: expect.arrayContaining(['boss_helper_jobs_current', 'boss_helper_jobs_detail', 'boss_helper_plan_preview']),
      }),
    )
    expect(result.workflow.nextActions).toEqual([
      'plan.preview 已显示仍有岗位需要进一步人工复核，先检查对应候选详情。',
      '优先依据 workflow.planFocus 收敛下一步，而不是重新人工统计 preview summary。',
    ])
    expect(commandCall).toHaveBeenCalledWith(
      'jobs.current',
      expect.objectContaining({ includeDetail: false, waitForRelay: false }),
    )
    expect(commandCall).toHaveBeenCalledWith(
      'plan.preview',
      expect.objectContaining({ jobIds: ['job-2', 'job-1', 'job-3'], waitForRelay: false }),
    )
    expect(result.sections.plan).toEqual(
      expect.objectContaining({
        scope: {
          source: 'candidate-focus',
          targetJobIds: ['job-2', 'job-1', 'job-3'],
        },
        data: expect.objectContaining({
          summary: expect.objectContaining({
            missingInfoCount: 1,
            needsManualReviewCount: 1,
          }),
        }),
      }),
    )
  })

})
