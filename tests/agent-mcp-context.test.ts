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

  it('recommends inspecting risk warnings before resuming a run paused by the failure guardrail', async () => {
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
                    code: 'consecutive-failure-auto-stop',
                    message: '连续失败达到 3 次，已自动暂停投递，请先检查最近错误后再决定是否 resume。',
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
      '检测到 run run-guardrail 因连续失败自动暂停，先检查 boss_helper_stats.risk.warnings 与 run.lastError，再决定是否 resume。',
    )
    expect(result.recommendations).not.toContain(
      '检测到暂停中的 run run-guardrail，如确认页面仍一致，可先调用 boss_helper_resume。',
    )
  })
})
