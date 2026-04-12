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
})