/* c8 ignore start */
import type { BossHelperAgentResponse, BossHelperAgentResponseMeta } from '@/message/agent'

export interface UseAgentQueriesOptions {
  currentProgressSnapshot: () => Record<string, unknown>
  ensureStoresLoaded: () => Promise<void>
  ensureSupportedPage: () => boolean
  fail: (
    code: string,
    message: string,
    meta?: BossHelperAgentResponseMeta,
  ) => Promise<BossHelperAgentResponse>
  ok: (
    code: string,
    message: string,
    meta?: BossHelperAgentResponseMeta,
  ) => Promise<BossHelperAgentResponse>
}
/* c8 ignore stop */
