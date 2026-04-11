// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BOSS_HELPER_AGENT_BRIDGE_REQUEST,
  BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
  BOSS_HELPER_AGENT_CHANNEL,
  BOSS_HELPER_AGENT_EVENT_BRIDGE,
  BOSS_HELPER_AGENT_EVENT_FORWARD,
} from '@/message/agent'
import {
  ContentCounter,
  InjectBackgroundAdapter,
  ProvideContentAdapter,
  registerAgentMessageBridge,
} from '@/message/contentScript'

import {
  __emitRuntimeMessage,
  __getStorageItem,
  browser,
} from './mocks/wxt-imports'

function createSameOriginMessageEvent(data: unknown, source: Window = window) {
  const event = new MessageEvent('message', {
    data,
    origin: window.location.origin,
  })
  Object.defineProperty(event, 'source', {
    configurable: true,
    value: source,
  })
  return event
}

describe('message/contentScript', () => {
  beforeEach(() => {
    vi.useRealTimers()
    window.history.replaceState({}, '', '/web/geek/job')
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: undefined,
      writable: true,
    })
  })

  it('delegates background methods and stores sync keys by default', async () => {
    const background = {
      cookieInfo: vi.fn(async () => ({ ok: true })),
      cookieSwitch: vi.fn(async () => true),
      cookieSave: vi.fn(async () => true),
      cookieDelete: vi.fn(async () => true),
      cookieClear: vi.fn(async () => true),
      request: vi.fn(async () => ({ data: 1 })),
      notify: vi.fn(async () => true),
      backgroundTest: vi.fn(async () => 1),
    }
    const counter = new ContentCounter(background as never)

    expect(await counter.cookieInfo()).toEqual({ ok: true })
    expect(await counter.cookieSwitch('1')).toBe(true)
    expect(await counter.cookieSave({ uid: '1' } as never)).toBe(true)
    expect(await counter.cookieDelete('1')).toBe(true)
    expect(await counter.cookieClear()).toBe(true)
    expect(await counter.request({ url: 'https://example.com' } as never)).toEqual({ data: 1 })
    expect(await counter.notify({ title: 'hello' } as never)).toBe(true)
    expect(await counter.backgroundTest('success')).toBe(1)

    expect(background.cookieInfo).toHaveBeenCalledTimes(1)
    expect(background.cookieSwitch).toHaveBeenCalledWith('1')
    expect(background.cookieSave).toHaveBeenCalledTimes(1)
    expect(background.cookieDelete).toHaveBeenCalledWith('1')
    expect(background.cookieClear).toHaveBeenCalledTimes(1)
    expect(background.request).toHaveBeenCalledTimes(1)
    expect(background.notify).toHaveBeenCalledTimes(1)
    expect(background.backgroundTest).toHaveBeenCalledWith('success')

    expect(await counter.storageGet('missing', 'fallback')).toBe('fallback')
    await counter.storageSet('plain-key', { ok: true })
    await counter.storageSet('session:raw-key', 2)

    expect(__getStorageItem('sync:plain-key')).toEqual({ ok: true })
    expect(__getStorageItem('session:raw-key')).toBe(2)

    await counter.storageRm('plain-key')
    expect(__getStorageItem('sync:plain-key')).toBeUndefined()

    await expect(counter.contentScriptTest('error')).rejects.toThrow('test error date')
    expect(await counter.contentScriptTest('success')).toEqual(expect.any(Number))
  })

  it('sends runtime messages with page metadata and unregisters listeners', async () => {
    browser.runtime.sendMessage = vi.fn(async () => ({ ok: true })) as typeof browser.runtime.sendMessage
    const adapter = new InjectBackgroundAdapter()
    const callback = vi.fn()
    const unregister = adapter.onMessage(callback) as () => void

    await adapter.sendMessage({ payload: { ok: true }, type: 'test' } as never, undefined as never)
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      browser.runtime.id,
      expect.objectContaining({
        meta: { url: window.location.href },
        type: 'test',
      }),
    )

    await __emitRuntimeMessage({ payload: { ok: true }, type: 'incoming' })
    expect(callback).toHaveBeenCalledWith({ payload: { ok: true }, type: 'incoming' })

    unregister()
    await __emitRuntimeMessage({ type: 'ignored' })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('bridges parent window messages with same-origin checks', () => {
    const adapter = new ProvideContentAdapter()
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined)
    const callback = vi.fn()
    const unregister = adapter.onMessage(callback) as () => void

    adapter.sendMessage({ type: 'ping' } as never, undefined as never)

    const foreignEvent = new MessageEvent('message', {
      data: { type: 'foreign' },
      origin: 'https://evil.example',
    })
    Object.defineProperty(foreignEvent, 'source', {
      configurable: true,
      value: window.parent,
    })
    window.dispatchEvent(foreignEvent)

    window.dispatchEvent(createSameOriginMessageEvent({ type: 'safe' }, window.parent))
    unregister()
    window.dispatchEvent(createSameOriginMessageEvent({ type: 'after-unregister' }, window.parent))

    expect(postMessageSpy).toHaveBeenCalledWith({ type: 'ping' }, window.location.origin)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith({ type: 'safe' })
  })

  it('forwards page events to background and resolves runtime requests through the window bridge', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(((data: unknown, _origin: string) => {
      if ((data as { type?: string }).type !== BOSS_HELPER_AGENT_BRIDGE_REQUEST) {
        return undefined
      }

      window.dispatchEvent(
        createSameOriginMessageEvent(
          {
            type: BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
            requestId: (data as { requestId: string }).requestId,
            payload: {
              ok: true,
              code: 'stats',
              message: 'ok',
            },
          },
          window,
        ),
      )
      return undefined
    }) as never)

    browser.runtime.sendMessage = vi.fn(async () => undefined) as typeof browser.runtime.sendMessage

    registerAgentMessageBridge()

    const response = await __emitRuntimeMessage({
      channel: BOSS_HELPER_AGENT_CHANNEL,
      command: 'stats',
    })

    window.dispatchEvent(
      createSameOriginMessageEvent({
        type: BOSS_HELPER_AGENT_EVENT_BRIDGE,
        payload: {
          id: 'evt-1',
          createdAt: new Date().toISOString(),
          message: 'job started',
          type: 'job-started',
        },
      }),
    )

    expect(response).toEqual(
      expect.objectContaining({
        code: 'stats',
        ok: true,
      }),
    )
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ command: 'stats' }),
        type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
      }),
      window.location.origin,
    )
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: BOSS_HELPER_AGENT_EVENT_FORWARD,
      payload: expect.objectContaining({
        id: 'evt-1',
        message: 'job started',
        type: 'job-started',
      }),
    })
  })

  it('uses the chrome sendResponse listener path and command-specific timeouts', async () => {
    vi.useFakeTimers()

    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    vi.stubGlobal(
      'chrome',
      {
        runtime: {
          onMessage: browser.runtime.onMessage,
        },
      } as unknown as typeof chrome,
    )

    registerAgentMessageBridge()

    const startPromise = __emitRuntimeMessage({
      channel: BOSS_HELPER_AGENT_CHANNEL,
      command: 'start',
    })
    const stopPromise = __emitRuntimeMessage({
      channel: BOSS_HELPER_AGENT_CHANNEL,
      command: 'stop',
    })
    const statsPromise = __emitRuntimeMessage({
      channel: BOSS_HELPER_AGENT_CHANNEL,
      command: 'stats',
    })

    expect(setTimeoutSpy.mock.calls.map((call) => call[1])).toEqual(
      expect.arrayContaining([5_000, 10_000, 65_000]),
    )

    await vi.runAllTimersAsync()

    await expect(startPromise).resolves.toEqual(
      expect.objectContaining({ code: 'page-timeout', ok: false }),
    )
    await expect(stopPromise).resolves.toEqual(
      expect.objectContaining({ code: 'page-timeout', ok: false }),
    )
    await expect(statsPromise).resolves.toEqual(
      expect.objectContaining({ code: 'page-timeout', ok: false }),
    )
    expect(postMessageSpy).toHaveBeenCalledTimes(3)
  })
})
