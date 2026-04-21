// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

type SelectorHealthMockResult = { ok: boolean }

const contentMocks = vi.hoisted(() => {
  class MockProvideContentAdapter {}

  return {
    browser: {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test${path}`),
      },
    },
    defineContentScript: vi.fn((definition) => definition),
    provideContentCounter: vi.fn(),
    registerAgentMessageBridge: vi.fn(),
    isSupportedSiteUrl: vi.fn(() => true),
    waitForDocumentReady: vi.fn(async () => undefined),
    collectSelectorHealth: vi.fn<() => SelectorHealthMockResult[]>(() => []),
    formatSelectorHealth: vi.fn(() => 'summary'),
    ProvideContentAdapter: MockProvideContentAdapter,
  }
})

vi.mock('#imports', () => ({
  browser: contentMocks.browser,
  defineContentScript: contentMocks.defineContentScript,
}))

vi.mock('@/message/contentScript', () => ({
  ProvideContentAdapter: contentMocks.ProvideContentAdapter,
  provideContentCounter: contentMocks.provideContentCounter,
  registerAgentMessageBridge: contentMocks.registerAgentMessageBridge,
}))

vi.mock('@/site-adapters', () => ({
  isSupportedSiteUrl: contentMocks.isSupportedSiteUrl,
}))

vi.mock('@/utils/selectors', () => ({
  DOM_READY_TIMEOUT_MS: 321,
  collectSelectorHealth: contentMocks.collectSelectorHealth,
  formatSelectorHealth: contentMocks.formatSelectorHealth,
  waitForDocumentReady: contentMocks.waitForDocumentReady,
}))

async function loadEntrypoint() {
  return (await import('@/entrypoints/content')).default
}

async function loadWindowModule() {
  return import('@/message/window')
}

async function startEntrypoint() {
  const originalAppend = Element.prototype.append
  let injectedScript: HTMLScriptElement | null = null
  const appendSpy = vi.spyOn(Element.prototype, 'append').mockImplementation(function append(
    this: Element,
    ...nodes: Array<string | Node>
  ) {
    for (const node of nodes) {
      if (node instanceof HTMLScriptElement) {
        injectedScript = node
      }
    }

    return Reflect.apply(originalAppend, this, nodes)
  })

  const entrypoint = await loadEntrypoint()
  const mainPromise = entrypoint.main({} as never)
  const windowModule = await loadWindowModule()
  const bridge = windowModule.getBossHelperWindowBridgeTarget() as HTMLElement
  if (!injectedScript) {
    throw new Error('Expected main-world script to be injected')
  }
  const script: HTMLScriptElement = injectedScript

  script.dispatchEvent(new Event('load'))

  const cleanup = await mainPromise
  appendSpy.mockRestore()

  return {
    bridge,
    cleanup,
    script,
    windowModule,
  }
}

describe('content entrypoint', () => {
  beforeEach(async () => {
    vi.resetModules()
    contentMocks.defineContentScript.mockClear()
    contentMocks.browser.runtime.getURL.mockReset()
    contentMocks.browser.runtime.getURL.mockImplementation((path: string) => `chrome-extension://test${path}`)
    contentMocks.provideContentCounter.mockClear()
    contentMocks.registerAgentMessageBridge.mockReset()
    contentMocks.registerAgentMessageBridge.mockReturnValue(undefined)
    contentMocks.isSupportedSiteUrl.mockReset()
    contentMocks.isSupportedSiteUrl.mockReturnValue(true)
    contentMocks.waitForDocumentReady.mockReset()
    contentMocks.waitForDocumentReady.mockResolvedValue(undefined)
    contentMocks.collectSelectorHealth.mockReset()
    contentMocks.collectSelectorHealth.mockReturnValue([])
    contentMocks.formatSelectorHealth.mockReset()
    contentMocks.formatSelectorHealth.mockReturnValue('summary')
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/web/geek/job')

    const { resetBossHelperPrivateBridgeForTest } = await loadWindowModule()
    resetBossHelperPrivateBridgeForTest()
  })

  it('registers content bridges and injects the main-world script into the private bridge', async () => {
    const stopAgentBridge = vi.fn()
    contentMocks.registerAgentMessageBridge.mockReturnValueOnce(stopAgentBridge)

    const { bridge, cleanup, script, windowModule } = await startEntrypoint()

    expect(contentMocks.provideContentCounter).toHaveBeenCalledTimes(1)
    expect(contentMocks.provideContentCounter.mock.calls[0][0]).toBeInstanceOf(
      contentMocks.ProvideContentAdapter,
    )
    expect(contentMocks.registerAgentMessageBridge).toHaveBeenCalledTimes(1)
    expect(contentMocks.browser.runtime.getURL).toHaveBeenCalledWith('/main-world.js')
    expect(script).toBeTruthy()
    expect(script.parentElement?.id).toBe(windowModule.getBossHelperPrivateBridgeNodeId())
    expect(bridge.id).toBe(windowModule.getBossHelperPrivateBridgeHostId())
    expect(script.src).toMatch(/^chrome-extension:\/\/test\/main-world\.js\?bridgeEvent=/)
    expect(script.getAttribute(`data-${windowModule.getBossHelperMainWorldScriptMarker()}`)).toBe('true')
    expect(document.head.querySelector('script')).toBeNull()

    cleanup?.()

    expect(stopAgentBridge).toHaveBeenCalledTimes(1)
    expect(script.isConnected).toBe(false)
  })

  it('warns when supported pages fail selector health after document ready', async () => {
    const warnSpy = vi.spyOn(window.console, 'warn').mockImplementation(() => {})
    contentMocks.collectSelectorHealth.mockReturnValue([{ ok: false }, { ok: true }])
    contentMocks.formatSelectorHealth.mockReturnValue('1 failed')

    const { cleanup } = await startEntrypoint()
    await Promise.resolve()

    expect(contentMocks.waitForDocumentReady).toHaveBeenCalledWith(321)
    expect(contentMocks.collectSelectorHealth).toHaveBeenCalledWith('/web/geek/job')
    expect(warnSpy).toHaveBeenCalledWith(
      '[BossHelper] content script selector health check failed',
      expect.objectContaining({
        pathname: '/web/geek/job',
        summary: '1 failed',
      }),
    )

    cleanup?.()
  })

  it('skips selector warnings on unsupported pages', async () => {
    const warnSpy = vi.spyOn(window.console, 'warn').mockImplementation(() => {})
    contentMocks.isSupportedSiteUrl.mockReturnValue(false)
    contentMocks.collectSelectorHealth.mockReturnValue([{ ok: false }])

    const { cleanup } = await startEntrypoint()
    await Promise.resolve()

    expect(contentMocks.collectSelectorHealth).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()

    cleanup?.()
  })

  it('swallows document ready failures', async () => {
    contentMocks.waitForDocumentReady.mockRejectedValue(new Error('timeout'))

    const { cleanup } = await startEntrypoint()

    await Promise.resolve()
    expect(contentMocks.collectSelectorHealth).not.toHaveBeenCalled()

    cleanup?.()
  })
})
