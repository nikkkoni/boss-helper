// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import {
  BOSS_HELPER_AGENT_BRIDGE_REQUEST,
  BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
  BOSS_HELPER_AGENT_CHANNEL,
  BOSS_HELPER_AGENT_EVENT_BRIDGE,
  type BossHelperAgentController,
} from '@/message/agent'
import { registerWindowAgentBridge } from '@/pages/zhipin/hooks/agentWindowBridge'

function createWindowEvent(
  data: unknown,
  options: {
    origin?: string
    source?: Window | null
  } = {},
) {
  const event = new MessageEvent('message', {
    data,
    origin: options.origin ?? window.location.origin,
  })
  Object.defineProperty(event, 'source', {
    configurable: true,
    value: options.source ?? window,
  })
  return event
}

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
    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {})

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

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        type: BOSS_HELPER_AGENT_EVENT_BRIDGE,
        payload: expect.objectContaining({ message: 'event payload', type: 'job-started' }),
      },
      window.location.origin,
    )

    window.dispatchEvent(
      createWindowEvent({
        type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
        requestId: 'req-1',
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
      }),
    )

    await waitForAssert(() => {
      expect(handle).toHaveBeenCalledWith({
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'stats',
      })
      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          type: BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
          requestId: 'req-1',
          payload: expect.objectContaining({ code: 'stats', message: 'ok', ok: true }),
        },
        window.location.origin,
      )
    })

    unregister()
    expect(stopEvents).toHaveBeenCalledTimes(1)
  })

  it('normalizes controller failures before posting bridge responses', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
    const unregister = registerWindowAgentBridge({
      controller: createController(
        vi.fn(async () => {
          throw new Error('stats exploded')
        }),
      ),
      onEvent: () => vi.fn(),
    })

    window.dispatchEvent(
      createWindowEvent({
        type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
        requestId: 'req-2',
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
      }),
    )

    await waitForAssert(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          type: BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
          requestId: 'req-2',
          payload: expect.objectContaining({
            code: 'controller-error',
            message: 'stats exploded',
            ok: false,
            retryable: true,
            suggestedAction: 'refresh-page',
          }),
        },
        window.location.origin,
      )
    })

    unregister()
  })

  it('ignores invalid or cross-origin messages and removes the listener on unregister', async () => {
    const handle = vi.fn(async () => ({ code: 'stats', ok: true, message: 'ok' }))
    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
    const unregister = registerWindowAgentBridge({
      controller: createController(handle),
      onEvent: () => vi.fn(),
    })

    window.dispatchEvent(
      createWindowEvent(
        {
          type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
          requestId: 'req-cross-origin',
          payload: {
            channel: BOSS_HELPER_AGENT_CHANNEL,
            command: 'stats',
          },
        },
        { origin: 'https://evil.example' },
      ),
    )
    window.dispatchEvent(
      createWindowEvent({
        type: 'ignored-message',
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
      }),
    )

    await Promise.resolve()
    expect(handle).not.toHaveBeenCalled()
    expect(postMessageSpy).not.toHaveBeenCalled()

    unregister()

    window.dispatchEvent(
      createWindowEvent({
        type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
        requestId: 'req-after-unregister',
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
      }),
    )

    await Promise.resolve()
    expect(handle).not.toHaveBeenCalled()
  })
})
