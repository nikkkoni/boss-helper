// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import InjectAdapter from '@/message/index'

describe('InjectAdapter', () => {
  it('posts to the current origin and ignores foreign-origin window messages', async () => {
    const adapter = new InjectAdapter()
    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const callback = vi.fn()
    const unregister = await adapter.onMessage(callback)

    adapter.sendMessage({ channel: 'test' } as never, undefined as never)

    const foreignEvent = new MessageEvent('message', {
      data: { foreign: true },
      origin: 'https://evil.example',
    })
    Object.defineProperty(foreignEvent, 'source', {
      configurable: true,
      value: window,
    })
    window.dispatchEvent(foreignEvent)

    const sameOriginEvent = new MessageEvent('message', {
      data: { safe: true },
      origin: window.location.origin,
    })
    Object.defineProperty(sameOriginEvent, 'source', {
      configurable: true,
      value: window,
    })
    window.dispatchEvent(sameOriginEvent)

    expect(postMessageSpy).toHaveBeenCalledWith({ channel: 'test' }, window.location.origin)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith({ safe: true })

    if (typeof unregister === 'function') {
      unregister()
    }
    postMessageSpy.mockRestore()
  })
})
