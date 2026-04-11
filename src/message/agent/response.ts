import { BOSS_HELPER_AGENT_BRIDGE_RESPONSE } from './constants'
import type { BossHelperAgentStatsData } from './jobs'

export interface BossHelperAgentResponse<T = BossHelperAgentStatsData> {
  code: string
  data?: T
  message: string
  ok: boolean
}

export interface BossHelperAgentBridgeResponse {
  payload: BossHelperAgentResponse
  requestId: string
  type: typeof BOSS_HELPER_AGENT_BRIDGE_RESPONSE
}
