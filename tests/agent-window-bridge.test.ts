// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import {
  BOSS_HELPER_AGENT_BRIDGE_REQUEST,
  BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
  BOSS_HELPER_AGENT_CHANNEL,
  BOSS_HELPER_AGENT_EVENT_BRIDGE,
  type BossHelperAgentController,
} from '@/message/agent'
import {
  getBossHelperPrivateBridgeEventType,
  getBossHelperWindowBridgeTarget,
  postBossHelperWindowMessage,
} from '@/message/window'
import { registerWindowAgentBridge } from '@/pages/zhipin/hooks/agentWindowBridge'

import { usePrivateBridgeTarget } from './helpers/private-bridge'

usePrivateBridgeTarget()

async function waitForAssert(assertion: () => void, attempts = 20) {
  let lastError: unknown
  for (let index = 0; index < attempts; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await Promise.resolve()
    }
  }
  throw lastError
}

function createController(handle: BossHelperAgentController['handle']): BossHelperAgentController {
  const noop = vi.fn(async () => ({ code: 'noop', ok: true, message: 'noop' }))
  return {
    configGet: noop,
    configUpdate: noop,
    handle,
    jobsCurrent: noop,
    jobsDetail: noop,
    jobsList: noop,
    jobsRefresh: noop,
    jobsReview: noop,
    logsQuery: noop,
    navigate: noop,
    readinessGet: noop,
    chatHistory: noop,
    chatList: noop,
    chatSend: noop,
    pause: noop,
    resume: noop,
    resumeGet: noop,
    start: noop,
    stop: noop,
    stats: noop,
  } as unknown as BossHelperAgentController
}

describe('registerWindowAgentBridge', () => {
  it('forwards agent events and posts bridge responses for valid requests', async () => {
    const handle = vi.fn(async () => ({ code: 'stats', ok: true, message: 'ok' }))
    const stopEvents = vi.fn()
    const bridgeTarget = getBossHelperWindowBridgeTarget()
    const dispatchSpy = vi.spyOn(bridgeTarget, 'dispatchEvent')

    const unregister = registerWindowAgentBridge({
      controller: createController(handle),
      onEvent(listener) {
        listener({
          id: 'event-1',
          createdAt: new Date().toISOString(),
          message: 'event payload',
          type: 'job-started',
        })
        return stopEvents
      },
    })

    const eventBridgeCalls = dispatchSpy.mock.calls.map(([event]) => event as CustomEvent<string>)
    expect(
      eventBridgeCalls.some(
        (event) => {
          if (event.type !== getBossHelperPrivateBridgeEventType()) {
            return false
          }
          const detail = JSON.parse(event.detail) as { payload?: { message?: string }; type?: string }
          return detail.type === BOSS_HELPER_AGENT_EVENT_BRIDGE && detail.payload?.message === 'event payload'
        },
      ),
    ).toBe(true)

    postBossHelperWindowMessage(bridgeTarget, {
      payload: {
        type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
        requestId: 'req-1',
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
      },
      type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
    })

    await waitForAssert(() => {
      expect(handle).toHaveBeenCalledWith({
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'stats',
      })
      const calls = dispatchSpy.mock.calls.map(([event]) => event as CustomEvent<string>)
      expect(
        calls.some(
          (event) => {
            if (event.type !== getBossHelperPrivateBridgeEventType()) {
              return false
            }
            const detail = JSON.parse(event.detail) as {
              payload?: { payload?: { code?: string }; requestId?: string }
              type?: string
            }
            return detail.type === BOSS_HELPER_AGENT_BRIDGE_RESPONSE
              && detail.payload?.requestId === 'req-1'
              && detail.payload?.payload?.code === 'stats'
          },
        ),
      ).toBe(true)
    })

    unregister()
    expect(stopEvents).toHaveBeenCalledTimes(1)
  })

  it('normalizes controller failures before posting bridge responses', async () => {
    const bridgeTarget = getBossHelperWindowBridgeTarget()
    const dispatchSpy = vi.spyOn(bridgeTarget, 'dispatchEvent')
    const unregister = registerWindowAgentBridge({
      controller: createController(
        vi.fn(async () => {
          throw new Error('stats exploded')
        }),
      ),
      onEvent: () => vi.fn(),
    })

    postBossHelperWindowMessage(bridgeTarget, {
      payload: {
        type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
        requestId: 'req-2',
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
      },
      type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
    })

    await waitForAssert(() => {
      const calls = dispatchSpy.mock.calls.map(([event]) => event as CustomEvent<string>)
      expect(
        calls.some(
          (event) => {
            if (event.type !== getBossHelperPrivateBridgeEventType()) {
              return false
            }
            const detail = JSON.parse(event.detail) as {
              payload?: { payload?: { code?: string; message?: string }; requestId?: string }
              type?: string
            }
            return detail.type === BOSS_HELPER_AGENT_BRIDGE_RESPONSE
              && detail.payload?.requestId === 'req-2'
              && detail.payload?.payload?.code === 'controller-error'
              && detail.payload?.payload?.message === 'stats exploded'
          },
        ),
      ).toBe(true)
    })

    unregister()
  })

  it('ignores invalid messages and removes the listener on unregister', async () => {
    const handle = vi.fn(async () => ({ code: 'stats', ok: true, message: 'ok' }))
    const bridgeTarget = getBossHelperWindowBridgeTarget()
    const dispatchSpy = vi.spyOn(bridgeTarget, 'dispatchEvent')
    const unregister = registerWindowAgentBridge({
      controller: createController(handle),
      onEvent: () => vi.fn(),
    })

    postBossHelperWindowMessage(bridgeTarget, {
      payload: {
        type: 'ignored-message',
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
      },
      type: 'ignored-message',
    })

    await Promise.resolve()
    expect(handle).not.toHaveBeenCalled()
    expect(
      dispatchSpy.mock.calls.some(
        ([event]) => {
          if ((event as CustomEvent<string>).type !== getBossHelperPrivateBridgeEventType()) {
            return false
          }
          const detail = JSON.parse((event as CustomEvent<string>).detail) as { type?: string }
          return detail.type === BOSS_HELPER_AGENT_BRIDGE_RESPONSE
        },
      ),
    ).toBe(false)

    unregister()

    postBossHelperWindowMessage(bridgeTarget, {
      payload: {
        type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
        requestId: 'req-after-unregister',
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
      },
      type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
    })

    await Promise.resolve()
    expect(handle).not.toHaveBeenCalled()
  })

})
