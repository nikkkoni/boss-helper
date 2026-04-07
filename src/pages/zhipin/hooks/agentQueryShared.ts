import type { BossHelperAgentResponse } from '@/message/agent'

export interface UseAgentQueriesOptions {
  currentProgressSnapshot: () => Record<string, unknown>
  ensureStoresLoaded: () => Promise<void>
  ensureSupportedPage: () => boolean
  fail: (code: string, message: string) => Promise<BossHelperAgentResponse>
  ok: (code: string, message: string) => Promise<BossHelperAgentResponse>
}