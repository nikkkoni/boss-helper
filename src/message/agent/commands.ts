import type { RuntimeConfigPatch } from '@/types/formData'

import { BOSS_HELPER_AGENT_BRIDGE_REQUEST, BOSS_HELPER_AGENT_CHANNEL } from './constants'
import type { BossHelperAgentJobPipelineStatus } from './types'

/** Agent 协议支持的命令集合，顺序保持与外部 bridge/MCP 工具目录一致。 */
export const bossHelperAgentCommands = [
  'start',
  'pause',
  'resume',
  'resume.get',
  'stop',
  'stats',
  'plan.preview',
  'readiness.get',
  'navigate',
  'logs.query',
  'jobs.list',
  'jobs.current',
  'jobs.refresh',
  'jobs.detail',
  'jobs.review',
  'config.get',
  'config.update',
] as const

export type BossHelperAgentCommand = (typeof bossHelperAgentCommands)[number]
export type BossHelperAgentConfigPatch = RuntimeConfigPatch

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
  confirmHighRisk?: boolean
  configPatch?: BossHelperAgentConfigPatch
  jobIds?: string[]
  persistConfig?: boolean
  resetFiltered?: boolean
}

export interface BossHelperAgentResumePayload {
  confirmHighRisk: boolean
}

export interface BossHelperAgentConfigUpdatePayload {
  confirmHighRisk?: boolean
  configPatch: BossHelperAgentConfigPatch
  persist?: boolean
}

export interface BossHelperAgentPlanPreviewPayload {
  configPatch?: BossHelperAgentConfigPatch
  jobIds?: string[]
  resetFiltered?: boolean
}

export interface BossHelperAgentNavigatePayload {
  city?: string
  multiBusinessDistrict?: string
  page?: number
  position?: string
  query?: string
  url?: string
}

export interface BossHelperAgentJobsListPayload {
  statusFilter?: BossHelperAgentJobPipelineStatus[]
}

export interface BossHelperAgentJobCurrentPayload {
  includeDetail?: boolean
}

export interface BossHelperAgentJobDetailPayload {
  encryptJobId: string
}

export interface BossHelperAgentJobReviewPayload {
  accepted: boolean
  encryptJobId: string
  negative?: Array<{ reason: string; score: number }>
  positive?: Array<{ reason: string; score: number }>
  rating?: number
  reason?: string
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
  resume: BossHelperAgentResumePayload | undefined
  'resume.get': undefined
  stop: undefined
  stats: undefined
  'plan.preview': BossHelperAgentPlanPreviewPayload | undefined
  'readiness.get': undefined
  navigate: BossHelperAgentNavigatePayload | undefined
  'logs.query': BossHelperAgentLogsQueryPayload | undefined
  'jobs.list': BossHelperAgentJobsListPayload | undefined
  'jobs.current': BossHelperAgentJobCurrentPayload | undefined
  'jobs.refresh': undefined
  'jobs.detail': BossHelperAgentJobDetailPayload
  'jobs.review': BossHelperAgentJobReviewPayload
  'config.get': undefined
  'config.update': BossHelperAgentConfigUpdatePayload
}
