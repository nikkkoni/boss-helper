// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

async function invokeReadiness() {
  const { __emitRuntimeMessageExternal } = await import('./mocks/wxt-imports')
  const {
    BOSS_HELPER_AGENT_BRIDGE_TOKEN,
    BOSS_HELPER_AGENT_CHANNEL,
  } = await import('@/message/agent')
  const background = (await import('@/entrypoints/background')).default

  background.main()

  return __emitRuntimeMessageExternal(
    {
      bridgeToken: BOSS_HELPER_AGENT_BRIDGE_TOKEN,
      channel: BOSS_HELPER_AGENT_CHANNEL,
      command: 'readiness.get',
    },
    { url: 'https://127.0.0.1/' },
  )
}

async function invokeNavigate(payload?: Record<string, unknown>) {
  const { __emitRuntimeMessageExternal } = await import('./mocks/wxt-imports')
  const {
    BOSS_HELPER_AGENT_BRIDGE_TOKEN,
    BOSS_HELPER_AGENT_CHANNEL,
  } = await import('@/message/agent')
  const background = (await import('@/entrypoints/background')).default

  background.main()

  return __emitRuntimeMessageExternal(
    {
      bridgeToken: BOSS_HELPER_AGENT_BRIDGE_TOKEN,
      channel: BOSS_HELPER_AGENT_CHANNEL,
      command: 'navigate',
      payload,
    },
    { url: 'https://127.0.0.1/' },
  )
}

describe('background readiness command', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: undefined,
      writable: true,
    })
  })

  it('returns navigate guidance when no Boss tab is open', async () => {
    const { browser } = await import('./mocks/wxt-imports')
    browser.tabs.query = vi.fn(async () => []) as typeof browser.tabs.query

    await expect(invokeReadiness()).resolves.toEqual(
      expect.objectContaining({
        code: 'readiness',
        ok: true,
        data: expect.objectContaining({
          ready: false,
          suggestedAction: 'navigate',
          page: expect.objectContaining({
            exists: false,
            supported: false,
            url: '',
          }),
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: 'boss-page-not-found' }),
          ]),
        }),
      }),
    )
  })

  it('distinguishes unsupported Boss routes from missing pages', async () => {
    const { browser } = await import('./mocks/wxt-imports')
    browser.tabs.query = vi.fn(async () => [
      {
        active: true,
        id: 1,
        title: 'Boss Chat',
        url: 'https://www.zhipin.com/web/geek/chat',
      },
    ]) as typeof browser.tabs.query

    await expect(invokeReadiness()).resolves.toEqual(
      expect.objectContaining({
        code: 'readiness',
        ok: true,
        data: expect.objectContaining({
          ready: false,
          suggestedAction: 'navigate',
          page: expect.objectContaining({
            exists: true,
            pathname: '/web/geek/chat',
            routeKind: 'unknown',
            supported: false,
            url: 'https://www.zhipin.com/web/geek/chat',
          }),
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: 'unsupported-page' }),
          ]),
        }),
      }),
    )
  })

  it('falls back to refresh guidance when a supported page does not respond', async () => {
    const { browser } = await import('./mocks/wxt-imports')
    browser.tabs.query = vi.fn(async () => [
      {
        active: true,
        id: 2,
        title: 'Boss Jobs',
        url: 'https://www.zhipin.com/web/geek/jobs?page=2',
      },
    ]) as typeof browser.tabs.query
    browser.tabs.sendMessage = vi.fn(async () => undefined) as typeof browser.tabs.sendMessage

    await expect(invokeReadiness()).resolves.toEqual(
      expect.objectContaining({
        code: 'readiness',
        ok: true,
        data: expect.objectContaining({
          ready: false,
          suggestedAction: 'refresh-page',
          page: expect.objectContaining({
            exists: true,
            pathname: '/web/geek/jobs',
            routeKind: 'jobs',
            supported: true,
          }),
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: 'empty-response' }),
          ]),
        }),
      }),
    )
  })

  it('lets navigate recover an unsupported verify page via callbackUrl', async () => {
    const { browser } = await import('./mocks/wxt-imports')
    const verifyUrl = 'https://www.zhipin.com/web/passport/zp/verify.html?callbackUrl=https%3A%2F%2Fwww.zhipin.com%2Fweb%2Fgeek%2Fjobs%3Fpage%3D3&code=36'
    browser.tabs.query = vi.fn(async () => [
      {
        active: true,
        id: 3,
        title: '安全验证 - BOSS直聘',
        url: verifyUrl,
      },
    ]) as typeof browser.tabs.query
    browser.tabs.update = vi.fn(async (_tabId, options) => ({
      id: 3,
      url: (options as { url?: string }).url,
    })) as typeof browser.tabs.update

    await expect(invokeNavigate({ query: 'frontend' })).resolves.toEqual(
      expect.objectContaining({
        code: 'navigate-accepted',
        ok: true,
        data: expect.objectContaining({
          targetUrl: 'https://www.zhipin.com/web/geek/jobs?page=3&query=frontend',
        }),
      }),
    )
    expect(browser.tabs.update).toHaveBeenCalledWith(3, {
      url: 'https://www.zhipin.com/web/geek/jobs?page=3&query=frontend',
    })
  })

  it('lets navigate recover other unsupported Boss pages via the default jobs route', async () => {
    const { browser } = await import('./mocks/wxt-imports')
    browser.tabs.query = vi.fn(async () => [
      {
        active: true,
        id: 4,
        title: 'Boss Chat',
        url: 'https://www.zhipin.com/web/geek/chat',
      },
    ]) as typeof browser.tabs.query
    browser.tabs.update = vi.fn(async (_tabId, options) => ({
      id: 4,
      url: (options as { url?: string }).url,
    })) as typeof browser.tabs.update

    await expect(invokeNavigate({ page: 2, query: 'golang' })).resolves.toEqual(
      expect.objectContaining({
        code: 'navigate-accepted',
        ok: true,
        data: expect.objectContaining({
          targetUrl: 'https://www.zhipin.com/web/geek/jobs?query=golang&page=2',
        }),
      }),
    )
    expect(browser.tabs.update).toHaveBeenCalledWith(4, {
      url: 'https://www.zhipin.com/web/geek/jobs?query=golang&page=2',
    })
  })

})
