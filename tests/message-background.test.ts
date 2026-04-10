import { describe, expect, it, vi } from 'vitest'

import {
  BackgroundCounter,
  isAllowedBackgroundRequestUrl,
  ProvideBackgroundAdapter,
} from '@/message/background'
import { browser } from './mocks/wxt-imports'

describe('message/background', () => {
  it('allows normal external https URLs and rejects local or invalid targets', () => {
    expect(isAllowedBackgroundRequestUrl('https://api.openai.com/v1/chat/completions')).toBe(true)
    expect(isAllowedBackgroundRequestUrl('https://api.deepseek.com/chat/completions')).toBe(true)

    expect(isAllowedBackgroundRequestUrl('http://api.openai.com/v1/chat/completions')).toBe(false)
    expect(isAllowedBackgroundRequestUrl('https://localhost:3000/relay')).toBe(false)
    expect(isAllowedBackgroundRequestUrl('https://127.0.0.1/relay')).toBe(false)
    expect(isAllowedBackgroundRequestUrl('https://192.168.1.10/relay')).toBe(false)
    expect(isAllowedBackgroundRequestUrl('https://169.254.1.20/relay')).toBe(false)
    expect(isAllowedBackgroundRequestUrl('https://[::1]/relay')).toBe(false)
    expect(isAllowedBackgroundRequestUrl('https://[fd00::1]/relay')).toBe(false)
    expect(isAllowedBackgroundRequestUrl('https://printer.local/relay')).toBe(false)
    expect(isAllowedBackgroundRequestUrl('not-a-url')).toBe(false)
  })

  it('rejects disallowed background proxy URLs before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new BackgroundCounter().request({
        data: { method: 'POST' },
        responseType: 'json',
        timeout: 1500,
        url: 'https://127.0.0.1/internal',
      }),
    ).rejects.toThrow('不支持代理该请求地址')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses millisecond timeout and omits credentials for allowed background fetches', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      new BackgroundCounter().request({
        data: {
          body: JSON.stringify({ hello: 'world' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
        responseType: 'json',
        timeout: 1500,
        url: 'https://api.openai.com/v1/chat/completions',
      }),
    ).resolves.toEqual({ ok: true })

    expect(timeoutSpy).toHaveBeenCalledWith(1500)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        credentials: 'omit',
        mode: 'cors',
        method: 'POST',
      }),
    )
  })

  it('only sends messages to tabs that have an id', async () => {
    browser.tabs.query = vi.fn(async () => [
      { id: undefined, url: 'https://www.zhipin.com/web/geek/job' },
      { id: 7, url: 'https://www.zhipin.com/web/geek/job' },
      { id: 9, url: 'https://www.zhipin.com/web/geek/job' },
    ]) as typeof browser.tabs.query
    browser.tabs.sendMessage = vi.fn(async () => undefined) as typeof browser.tabs.sendMessage

    await new ProvideBackgroundAdapter().sendMessage(
      {
        meta: { url: '*://*.zhipin.com/*' },
        payload: { type: 'ping' },
        type: 'test-message',
      } as any,
      [],
    )

    expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2)
    expect(browser.tabs.sendMessage).toHaveBeenNthCalledWith(
      1,
      7,
      expect.objectContaining({ type: 'test-message' }),
    )
    expect(browser.tabs.sendMessage).toHaveBeenNthCalledWith(
      2,
      9,
      expect.objectContaining({ type: 'test-message' }),
    )
  })
})
