// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

type SelectorHealthMockResult = { ok: boolean }

const contentMocks = vi.hoisted(() => {
  class MockProvideContentAdapter {}

  return {
    defineContentScript: vi.fn((definition) => definition),
    injectScript: vi.fn(async () => undefined),
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
  defineContentScript: contentMocks.defineContentScript,
  injectScript: contentMocks.injectScript,
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

describe('content entrypoint', () => {
  beforeEach(() => {
    vi.resetModules()
    contentMocks.defineContentScript.mockClear()
    contentMocks.injectScript.mockReset()
    contentMocks.injectScript.mockResolvedValue(undefined)
    contentMocks.provideContentCounter.mockClear()
    contentMocks.registerAgentMessageBridge.mockClear()
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
  })

  it('registers content bridges and injects the main-world script', async () => {
    const entrypoint = await loadEntrypoint()

    await entrypoint.main({} as never)

    expect(contentMocks.provideContentCounter).toHaveBeenCalledTimes(1)
    expect(contentMocks.provideContentCounter.mock.calls[0][0]).toBeInstanceOf(
      contentMocks.ProvideContentAdapter,
    )
    expect(contentMocks.registerAgentMessageBridge).toHaveBeenCalledTimes(1)
    expect(contentMocks.injectScript).toHaveBeenCalledWith('/main-world.js', {
      keepInDom: true,
    })
  })

  it('warns when supported pages fail selector health after document ready', async () => {
    const warnSpy = vi.spyOn(window.console, 'warn').mockImplementation(() => {})
    contentMocks.collectSelectorHealth.mockReturnValue([{ ok: false }, { ok: true }])
    contentMocks.formatSelectorHealth.mockReturnValue('1 failed')

    const entrypoint = await loadEntrypoint()
    await entrypoint.main({} as never)
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
  })

  it('skips selector warnings on unsupported pages', async () => {
    const warnSpy = vi.spyOn(window.console, 'warn').mockImplementation(() => {})
    contentMocks.isSupportedSiteUrl.mockReturnValue(false)
    contentMocks.collectSelectorHealth.mockReturnValue([{ ok: false }])

    const entrypoint = await loadEntrypoint()
    await entrypoint.main({} as never)
    await Promise.resolve()

    expect(contentMocks.collectSelectorHealth).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('swallows document ready failures', async () => {
    contentMocks.waitForDocumentReady.mockRejectedValue(new Error('timeout'))

    const entrypoint = await loadEntrypoint()

    await expect(entrypoint.main({} as never)).resolves.toBeUndefined()
    await Promise.resolve()
    expect(contentMocks.collectSelectorHealth).not.toHaveBeenCalled()
  })
})
