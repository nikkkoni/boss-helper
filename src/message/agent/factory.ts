import { resolveBossHelperAgentErrorMeta } from '../../../shared/agentProtocol.js'

import type {
  BossHelperAgentResponse,
  BossHelperAgentResponseMeta,
  BossHelperAgentStatsData,
} from './types'

export function createBossHelperAgentResponse<T = BossHelperAgentStatsData>(
  ok: boolean,
  code: string,
  message: string,
  data?: T,
  meta?: BossHelperAgentResponseMeta,
): BossHelperAgentResponse<T> {
  const resolvedMeta = ok ? meta ?? {} : resolveBossHelperAgentErrorMeta(code, meta)
  return {
    ok,
    code,
    message,
    data,
    ...resolvedMeta,
  }
}
