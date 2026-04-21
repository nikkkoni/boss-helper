import { describe, expect, it } from 'vitest'

import {
  BOSS_HELPER_AGENT_BRIDGE_REQUEST,
  BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
  BOSS_HELPER_AGENT_CHANNEL,
  BOSS_HELPER_AGENT_EVENT_BRIDGE,
  BOSS_HELPER_AGENT_EVENT_FORWARD,
} from '@/message/agent/constants'
import { bossHelperAgentCommands } from '@/message/agent/commands'
import { bossHelperAgentEventTypes } from '@/message/agent/events'
import {
  isBossHelperAgentBridgeRequest,
  isBossHelperAgentBridgeResponse,
  isBossHelperAgentEvent,
  isBossHelperAgentEventBridgeMessage,
  isBossHelperAgentEventForwardMessage,
  isBossHelperAgentRequest,
} from '@/message/agent/guards'

describe('agent guards', () => {
  it('validates agent request payloads', () => {
    const validRequest = {
      channel: BOSS_HELPER_AGENT_CHANNEL,
      command: bossHelperAgentCommands[0],
    }

    expect(isBossHelperAgentRequest(validRequest)).toBe(true)
    expect(isBossHelperAgentRequest({ ...validRequest, channel: 'other' })).toBe(false)
    expect(isBossHelperAgentRequest({ ...validRequest, command: 'unknown' })).toBe(false)
  })

  it('checks bridge requests and responses', () => {
    const validRequest = {
      channel: BOSS_HELPER_AGENT_CHANNEL,
      command: bossHelperAgentCommands[0],
    }
    const bridgeRequest = {
      payload: validRequest,
      requestId: 'req-1',
      type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
    }
    const bridgeResponse = {
      payload: { ok: true, code: 'ok', message: 'done' },
      requestId: 'req-1',
      type: BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
    }

    expect(isBossHelperAgentBridgeRequest(bridgeRequest)).toBe(true)
    expect(isBossHelperAgentBridgeRequest({ ...bridgeRequest, payload: { channel: 'x' } })).toBe(false)

    expect(isBossHelperAgentBridgeResponse(bridgeResponse)).toBe(true)
    expect(isBossHelperAgentBridgeResponse({ ...bridgeResponse, type: 'other' })).toBe(false)
    expect(
      isBossHelperAgentBridgeResponse({ ...bridgeResponse, payload: { ok: 'yes', code: 'ok', message: 'done' } }),
    ).toBe(false)
  })

  it('guards agent events and wrappers', () => {
    const validEvent = {
      createdAt: new Date().toISOString(),
      id: 'evt-1',
      message: 'hello',
      type: bossHelperAgentEventTypes[0],
    }

    expect(isBossHelperAgentEvent(validEvent)).toBe(true)
    expect(isBossHelperAgentEvent({ ...validEvent, type: 'unknown' })).toBe(false)

    const bridgeMessage = { type: BOSS_HELPER_AGENT_EVENT_BRIDGE, payload: validEvent }
    const forwardMessage = { type: BOSS_HELPER_AGENT_EVENT_FORWARD, payload: validEvent }

    expect(isBossHelperAgentEventBridgeMessage(bridgeMessage)).toBe(true)
    expect(isBossHelperAgentEventBridgeMessage({ ...bridgeMessage, type: BOSS_HELPER_AGENT_EVENT_FORWARD })).toBe(false)

    expect(isBossHelperAgentEventForwardMessage(forwardMessage)).toBe(true)
    expect(
      isBossHelperAgentEventForwardMessage({
        ...forwardMessage,
        payload: { ...validEvent, type: 'unknown' },
      }),
    ).toBe(false)
  })
})
