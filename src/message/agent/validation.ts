import type { BossHelperAgentExternalRequest } from './commands'
import {
  BOSS_HELPER_AGENT_BRIDGE_TOKEN,
  BOSS_HELPER_AGENT_EVENT_PORT,
  bossHelperSupportedJobPaths,
} from './constants'

export function hasValidBossHelperAgentBridgeToken(
  value: unknown,
): value is BossHelperAgentExternalRequest {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as Partial<BossHelperAgentExternalRequest>).bridgeToken ===
      BOSS_HELPER_AGENT_BRIDGE_TOKEN
  )
}

export function getBossHelperAgentEventPortName(token = BOSS_HELPER_AGENT_BRIDGE_TOKEN) {
  return `${BOSS_HELPER_AGENT_EVENT_PORT}:${token}`
}

export function hasValidBossHelperAgentEventPort(portName?: string | null) {
  return typeof portName === 'string' && portName === getBossHelperAgentEventPortName()
}

export function isBossHelperSupportedJobUrl(url?: string | null) {
  if (!url) return false
  try {
    const { pathname } = new URL(url)
    return bossHelperSupportedJobPaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  } catch {
    return false
  }
}
