import type { BossHelperAgentNavigatePayload } from '@/message/agent'
import { getActiveSiteAdapter } from '@/site-adapters'

export function buildBossHelperNavigateUrl(
  payload: BossHelperAgentNavigatePayload | undefined,
  currentUrl: string,
  origin: string,
) {
  return getActiveSiteAdapter(currentUrl).buildNavigateUrl(payload, currentUrl, origin)
}
