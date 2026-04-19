// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const relayHtmlPath = resolve(process.cwd(), 'scripts/agent-relay.html')

function extractRelayScript() {
  const html = readFileSync(relayHtmlPath, 'utf8')
  const bodyMatch = html.match(/<body>([\s\S]*?)<script>/i)
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i)

  if (!bodyMatch?.[1] || !scriptMatch?.[1]) {
    throw new Error('无法提取 relay HTML 的 body 或 script')
  }

  return {
    bodyHtml: bodyMatch[1],
    scriptContent: scriptMatch[1],
  }
}

function flushMicrotasks() {
  return Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
}

describe('agent relay page', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
    document.body.innerHTML = ''
    Reflect.deleteProperty(window, 'chrome')
    Reflect.deleteProperty(globalThis, 'chrome')
  })

  it('reconnects the extension event port after disconnecting and refreshes bootstrap', async () => {
    vi.useFakeTimers()

    const { bodyHtml, scriptContent } = extractRelayScript()
    document.body.innerHTML = bodyHtml
    localStorage.setItem('boss-helper-agent-extension-id', 'test-extension-id')

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        eventPortName: '__boss_helper_agent_event_port__:relay-test-token',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    class FakeEventSource {
      constructor(public readonly url: string, public readonly options?: Record<string, unknown>) {}

      addEventListener() {}

      close() {}
    }

    vi.stubGlobal('EventSource', FakeEventSource)

    const createdPorts: Array<{
      disconnect: ReturnType<typeof vi.fn>
      emitDisconnect: () => void
      onDisconnect: { addListener: (listener: () => void) => void }
      onMessage: { addListener: (listener: (event: unknown) => void) => void }
      postMessage: ReturnType<typeof vi.fn>
    }> = []

    const connectMock = vi.fn(() => {
      const disconnectListeners: Array<() => void> = []
      const port = {
        onMessage: {
          addListener: vi.fn(),
        },
        postMessage: vi.fn(),
        onDisconnect: {
          addListener(listener: () => void) {
            disconnectListeners.push(listener)
          },
        },
        disconnect: vi.fn(() => {
          disconnectListeners.forEach((listener) => listener())
        }),
        emitDisconnect() {
          disconnectListeners.forEach((listener) => listener())
        },
      }
      createdPorts.push(port)
      return port
    })

    const chromeStub = {
      runtime: {
        connect: connectMock,
        lastError: undefined as { message: string } | undefined,
      },
    }

    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: chromeStub,
    })
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: chromeStub,
    })

    new Function(scriptContent)()
    await flushMicrotasks()

    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalled()
    expect(document.getElementById('extensionEventsState')?.textContent).toBe('events: connected')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(createdPorts[0]?.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: '__boss_helper_agent_keepalive__',
      }),
    )

    chromeStub.runtime.lastError = { message: 'The message port closed before a response was received.' }
    createdPorts[0]?.emitDisconnect()

    expect(document.getElementById('extensionEventsState')?.textContent).toBe('events: reconnecting')

    await vi.advanceTimersByTimeAsync(3000)
    await flushMicrotasks()

    expect(connectMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(document.getElementById('extensionEventsState')?.textContent).toBe('events: connected')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(createdPorts[1]?.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: '__boss_helper_agent_keepalive__',
      }),
    )
  })
})
