import type { BossHelperAgentResponse, BossHelperAgentStatsData } from './types'

export function createBossHelperAgentResponse<T = BossHelperAgentStatsData>(
  ok: boolean,
  code: string,
  message: string,
  data?: T,
): BossHelperAgentResponse<T> {
  return {
    ok,
    code,
    message,
    data,
  }
}
