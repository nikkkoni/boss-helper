// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __emitRuntimeMessage,
  browser,
} from './mocks/wxt-imports'
import { createPrivateBridgeTarget } from './helpers/private-bridge'
import { setupPinia } from './helpers/pinia'

type MockTab = {
  active: boolean
  id: number
  url: string
}

describe('agent message integration', () => {
  beforeEach(async () => {
    vi.resetModules()
    setupPinia()
    window.history.replaceState({}, '', '/web/geek/job')
    const { setBossHelperWindowBridgeTargetForTest } = await import('@/message/window')
    setBossHelperWindowBridgeTargetForTest(createPrivateBridgeTarget())
  })

  it('forwards commands background -> content -> page controller and relays events back out', async () => {
    const {
      getBossHelperPrivateBridgeEventType,
      setBossHelperWindowBridgeTargetForTest,
    } = await import('@/message/window')
    const bridgeTarget = createPrivateBridgeTarget()
    setBossHelperWindowBridgeTargetForTest(bridgeTarget)
    const dispatchSpy = vi.spyOn(bridgeTarget, 'dispatchEvent')

    const {
      BOSS_HELPER_AGENT_BRIDGE_TOKEN,
      BOSS_HELPER_AGENT_CHANNEL,
      BOSS_HELPER_AGENT_EVENT_FORWARD,
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

    bridgeTarget.dispatchEvent(
      new CustomEvent(getBossHelperPrivateBridgeEventType(), {
        detail: {
          payload: {
            message: 'blocked',
            type: 'job-started',
          },
          type: 'ignored-message',
        },
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(browser.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ message: 'blocked' }),
      }),
    )

    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        message: 'job updated',
        type: 'job-started',
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(
      dispatchSpy.mock.calls.some(
        ([event]) => (event as CustomEvent).type === getBossHelperPrivateBridgeEventType(),
      ),
    ).toBe(true)

    unregister()
  })
})
