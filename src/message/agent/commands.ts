import type { FormData } from '@/types/formData'

import { BOSS_HELPER_AGENT_BRIDGE_REQUEST, BOSS_HELPER_AGENT_CHANNEL } from './constants'
import type { BossHelperAgentJobPipelineStatus } from './types'

export const bossHelperAgentCommands = [
  'start',
  'pause',
  'resume',
  'resume.get',
  'stop',
  'stats',
  'navigate',
  'chat.list',
  'chat.history',
  'chat.send',
  'logs.query',
  'jobs.list',
  'jobs.detail',
  'jobs.review',
  'config.get',
  'config.update',
] as const

export type BossHelperAgentCommand = (typeof bossHelperAgentCommands)[number]
export type BossHelperAgentConfigPatch = Partial<FormData>

export interface BossHelperAgentRequest<T extends BossHelperAgentCommand = BossHelperAgentCommand> {
  channel: typeof BOSS_HELPER_AGENT_CHANNEL
  command: T
  payload?: BossHelperAgentRequestPayloadMap[T]
  requestId?: string
  version?: number
}

export interface BossHelperAgentExternalRequest<
  T extends BossHelperAgentCommand = BossHelperAgentCommand,
> extends BossHelperAgentRequest<T> {
  bridgeToken: string
}

export interface BossHelperAgentBridgeRequest {
  payload: BossHelperAgentRequest
  requestId: string
  type: typeof BOSS_HELPER_AGENT_BRIDGE_REQUEST
}

export interface BossHelperAgentStartPayload {
  configPatch?: BossHelperAgentConfigPatch
  jobIds?: string[]
  persistConfig?: boolean
  resetFiltered?: boolean
}

export interface BossHelperAgentConfigUpdatePayload {
  configPatch: BossHelperAgentConfigPatch
  persist?: boolean
}

export interface BossHelperAgentNavigatePayload {
  city?: string
  page?: number
  position?: string
  query?: string
  url?: string
}

export interface BossHelperAgentJobsListPayload {
  statusFilter?: BossHelperAgentJobPipelineStatus[]
}

export interface BossHelperAgentJobDetailPayload {
  encryptJobId: string
}

export interface BossHelperAgentJobReviewPayload {
  accepted: boolean
  encryptJobId: string
  greeting?: string
  negative?: Array<{ reason: string; score: number }>
  positive?: Array<{ reason: string; score: number }>
  rating?: number
  reason?: string
}

export interface BossHelperAgentChatSendPayload {
  content: string
  form_uid?: number | string
  to_name: string
  to_uid: number | string
}

export interface BossHelperAgentChatListPayload {
  limit?: number
}

export interface BossHelperAgentChatHistoryPayload {
  conversationId: string
  limit?: number
  offset?: number
}

export interface BossHelperAgentLogsQueryPayload {
  from?: string
  limit?: number
  offset?: number
  status?: string[]
  to?: string
}

export interface BossHelperAgentRequestPayloadMap {
  start: BossHelperAgentStartPayload | undefined
  pause: undefined
  resume: undefined
  'resume.get': undefined
  stop: undefined
  stats: undefined
  navigate: BossHelperAgentNavigatePayload | undefined
  'chat.list': BossHelperAgentChatListPayload | undefined
  'chat.history': BossHelperAgentChatHistoryPayload
  'chat.send': BossHelperAgentChatSendPayload
  'logs.query': BossHelperAgentLogsQueryPayload | undefined
  'jobs.list': BossHelperAgentJobsListPayload | undefined
  'jobs.detail': BossHelperAgentJobDetailPayload
  'jobs.review': BossHelperAgentJobReviewPayload
  'config.get': undefined
  'config.update': BossHelperAgentConfigUpdatePayload
}
