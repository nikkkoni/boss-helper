import { BOSS_HELPER_AGENT_BRIDGE_RESPONSE } from './constants'
import type { BossHelperAgentStatsData } from './jobs'
import type { BossHelperAgentResponseMeta } from '../../../shared/agentProtocol.js'

export interface BossHelperAgentResponse<T = BossHelperAgentStatsData> extends BossHelperAgentResponseMeta {
  code: string
  data?: T
  message: string
  ok: boolean
}

export interface BossHelperAgentBridgeResponse {
  payload: BossHelperAgentResponse<unknown>
  requestId: string
  type: typeof BOSS_HELPER_AGENT_BRIDGE_RESPONSE
}
