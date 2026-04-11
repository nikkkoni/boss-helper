import {
  bossHelperAgentCommands,
  type BossHelperAgentBridgeRequest,
  type BossHelperAgentCommand,
  type BossHelperAgentRequest,
} from './commands'
import {
  BOSS_HELPER_AGENT_BRIDGE_REQUEST,
  BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
  BOSS_HELPER_AGENT_CHANNEL,
  BOSS_HELPER_AGENT_EVENT_BRIDGE,
  BOSS_HELPER_AGENT_EVENT_FORWARD,
} from './constants'
import {
  bossHelperAgentEventTypes,
  type BossHelperAgentEvent,
  type BossHelperAgentEventBridgeMessage,
  type BossHelperAgentEventForwardMessage,
  type BossHelperAgentEventType,
} from './events'
import type { BossHelperAgentBridgeResponse } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

export function isBossHelperAgentRequest(value: unknown): value is BossHelperAgentRequest {
  if (!isRecord(value)) return false
  return (
    value.channel === BOSS_HELPER_AGENT_CHANNEL &&
    typeof value.command === 'string' &&
    bossHelperAgentCommands.includes(value.command as BossHelperAgentCommand)
  )
}

export function isBossHelperAgentBridgeRequest(
  value: unknown,
): value is BossHelperAgentBridgeRequest {
  if (!isRecord(value)) return false
  return (
    value.type === BOSS_HELPER_AGENT_BRIDGE_REQUEST &&
    typeof value.requestId === 'string' &&
    isBossHelperAgentRequest(value.payload)
  )
}

export function isBossHelperAgentBridgeResponse(
  value: unknown,
): value is BossHelperAgentBridgeResponse {
  if (!isRecord(value) || value.type !== BOSS_HELPER_AGENT_BRIDGE_RESPONSE) return false
  if (typeof value.requestId !== 'string' || !isRecord(value.payload)) return false
  return (
    typeof value.payload.ok === 'boolean' &&
    typeof value.payload.code === 'string' &&
    typeof value.payload.message === 'string'
  )
}

export function isBossHelperAgentEvent(value: unknown): value is BossHelperAgentEvent {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.message === 'string' &&
    typeof value.type === 'string' &&
    bossHelperAgentEventTypes.includes(value.type as BossHelperAgentEventType)
  )
}

export function isBossHelperAgentEventBridgeMessage(
  value: unknown,
): value is BossHelperAgentEventBridgeMessage {
  return (
    isRecord(value) &&
    value.type === BOSS_HELPER_AGENT_EVENT_BRIDGE &&
    isBossHelperAgentEvent(value.payload)
  )
}

export function isBossHelperAgentEventForwardMessage(
  value: unknown,
): value is BossHelperAgentEventForwardMessage {
  return (
    isRecord(value) &&
    value.type === BOSS_HELPER_AGENT_EVENT_FORWARD &&
    isBossHelperAgentEvent(value.payload)
  )
}
