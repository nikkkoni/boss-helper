// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __emitRuntimeConnectExternal,
  __emitRuntimeMessage,
  __emitRuntimeMessageExternal,
  browser,
  createMockPort,
} from './mocks/wxt-imports'
import { setupPinia } from './helpers/pinia'

type MockTab = {
  active: boolean
  id: number
  url: string
}

describe('agent message integration', () => {
  beforeEach(() => {
    setupPinia()
    window.history.replaceState({}, '', '/web/geek/job')
  })

  it('forwards commands background -> content -> page controller and relays events back out', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(((data: unknown, origin: string) => {
      const event = new MessageEvent('message', { data, origin })
      Object.defineProperty(event, 'source', {
        configurable: true,
        value: window,
      })
      window.dispatchEvent(event)
    }) as any)

    const {
      BOSS_HELPER_AGENT_BRIDGE_TOKEN,
      BOSS_HELPER_AGENT_CHANNEL,
      getBossHelperAgentEventPortName,
    } = await import('@/message/agent')
    const background = (await import('@/entrypoints/background')).default
    const { registerAgentMessageBridge } = await import('@/message/contentScript')
    const { useDeliveryControl } = await import('@/pages/zhipin/hooks/useDeliveryControl')
    const { createBossHelperAgentEvent, emitBossHelperAgentEvent } = await import(
      '@/pages/zhipin/hooks/agentEvents'
    )
    const { useConf } = await import('@/stores/conf')
    const {
      BOSS_HELPER_AGENT_BRIDGE_REQUEST,
      BOSS_HELPER_AGENT_EVENT_BRIDGE,
    } = await import('@/message/agent')

    useConf().isLoaded = true

    browser.tabs.query = vi.fn(async () => [
      {
        active: true,
        id: 1,
        url: 'https://www.zhipin.com/web/geek/job',
      },
    ]) as typeof browser.tabs.query & ((...args: unknown[]) => Promise<MockTab[]>)
    browser.tabs.sendMessage = vi.fn(async (_tabId: unknown, message: unknown) => {
      return __emitRuntimeMessage(message)
    }) as typeof browser.tabs.sendMessage
    browser.runtime.sendMessage = vi.fn(async (message: unknown) => {
      return __emitRuntimeMessage(message)
    }) as typeof browser.runtime.sendMessage

    background.main()
    registerAgentMessageBridge()
    const unregister = useDeliveryControl().registerWindowAgentBridge()

    const foreignRequestEvent = new MessageEvent('message', {
      data: {
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
        requestId: 'foreign-origin-request',
        type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
      },
      origin: 'https://evil.example',
    })
    Object.defineProperty(foreignRequestEvent, 'source', {
      configurable: true,
      value: window,
    })
    window.dispatchEvent(foreignRequestEvent)

    const foreignBridgeEvent = new MessageEvent('message', {
      data: {
        payload: {
          message: 'blocked',
          type: 'job-started',
        },
        type: BOSS_HELPER_AGENT_EVENT_BRIDGE,
      },
      origin: 'https://evil.example',
    })
    Object.defineProperty(foreignBridgeEvent, 'source', {
      configurable: true,
      value: window,
    })
    window.dispatchEvent(foreignBridgeEvent)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(browser.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ message: 'blocked' }),
      }),
    )

    const statsResponse = await __emitRuntimeMessageExternal(
      {
        bridgeToken: BOSS_HELPER_AGENT_BRIDGE_TOKEN,
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'stats',
      },
      { url: 'https://127.0.0.1/' },
    )
    const insecureRelayResponse = await __emitRuntimeMessageExternal(
      {
        bridgeToken: BOSS_HELPER_AGENT_BRIDGE_TOKEN,
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'stats',
      },
      { url: 'http://127.0.0.1/' },
    )
    const unsupportedCommandResponse = await __emitRuntimeMessageExternal(
      {
        bridgeToken: BOSS_HELPER_AGENT_BRIDGE_TOKEN,
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'unknown.command',
      },
      { url: 'https://127.0.0.1/' },
    )

    expect(statsResponse).toEqual(
      expect.objectContaining({
        code: 'stats',
        ok: true,
      }),
    )
    expect(insecureRelayResponse).toEqual(
      expect.objectContaining({
        code: 'unauthorized-bridge',
        ok: false,
      }),
    )
    expect(unsupportedCommandResponse).toEqual(
      expect.objectContaining({
        code: 'invalid-command',
        ok: false,
        retryable: true,
        suggestedAction: 'refresh-page',
      }),
    )

    const port = createMockPort(getBossHelperAgentEventPortName(), {
      url: 'https://127.0.0.1/',
    })
    await __emitRuntimeConnectExternal(port)
    port.__emitMessage({
      type: '__boss_helper_agent_keepalive__',
      sentAt: new Date().toISOString(),
    })

    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        message: 'job updated',
        type: 'job-started',
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(port.__messages).toHaveLength(1)
    expect(port.__messages[0]).toEqual(
      expect.objectContaining({
        message: 'job updated',
        type: 'job-started',
      }),
    )
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.any(Object),
      window.location.origin,
    )

    unregister()
    postMessageSpy.mockRestore()
  })
})
