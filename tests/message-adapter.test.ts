// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import InjectAdapter from '@/message/index'
import {
  getBossHelperPrivateBridgeEventType,
  getBossHelperWindowBridgeTarget,
  postBossHelperWindowMessage,
} from '@/message/window'

import { usePrivateBridgeTarget } from './helpers/private-bridge'

usePrivateBridgeTarget()

describe('InjectAdapter', () => {
  it('posts to the private bridge target and receives only bridge events', async () => {
    const adapter = new InjectAdapter()
    const bridgeTarget = getBossHelperWindowBridgeTarget()
    const dispatchSpy = vi.spyOn(bridgeTarget, 'dispatchEvent')
    const callback = vi.fn()
    const unregister = await adapter.onMessage(callback)

    adapter.sendMessage({ channel: 'test' } as never, undefined as never)

    postBossHelperWindowMessage(bridgeTarget, {
      payload: { safe: true },
      type: 'comctx',
    })

    const bridgeEvents = dispatchSpy.mock.calls.map(([event]) => event as CustomEvent<string>)
    expect(
      bridgeEvents.some(
        (event) => {
          if (event.type !== getBossHelperPrivateBridgeEventType()) {
            return false
          }
          const detail = JSON.parse(event.detail) as { payload?: { channel?: string }; type?: string }
          return detail.type === 'comctx' && detail.payload?.channel === 'test'
        },
      ),
    ).toBe(true)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith({ safe: true })

    if (typeof unregister === 'function') {
      unregister()
    }
  })
})
