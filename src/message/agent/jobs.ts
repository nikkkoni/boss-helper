import type { Statistics } from '@/types/formData'

import type { BossHelperAgentSuggestedAction } from '../../../shared/agentProtocol.js'
import type { BossHelperAgentAudit } from '../../../shared/agentAudit.js'

export type BossHelperAgentJobPipelineStatus =
  | 'pending'
  | 'wait'
  | 'running'
  | 'success'
  | 'error'
  | 'warn'
export type BossHelperAgentState = 'idle' | 'running' | 'pausing' | 'paused' | 'completed' | 'error'

export interface BossHelperAgentJobSummary {
  areaDistrict: string
  bossName: string
  bossTitle: string
  brandName: string
  brandScaleName: string
  cityName: string
  contact: boolean
  encryptJobId: string
  goldHunter: boolean
  hasCard: boolean
  jobLabels: string[]
  jobName: string
  salaryDesc: string
  skills: string[]
  status: BossHelperAgentJobPipelineStatus
  statusMsg: string
  welfareList: string[]
}

export interface BossHelperAgentJobsListData {
  jobs: BossHelperAgentJobSummary[]
  total: number
  totalOnPage: number
}

export interface BossHelperAgentJobCurrentData {
  job: BossHelperAgentJobDetail | BossHelperAgentJobSummary | null
  selected: boolean
}

export interface BossHelperAgentJobsRefreshData {
  targetUrl: string
}

export interface BossHelperAgentJobDetail extends BossHelperAgentJobSummary {
  activeTimeDesc: string
  address: string
  brandIndustry: string
  degreeName: string
  experienceName: string
  friendStatus: number | null
  gps: { latitude: number; longitude: number } | null
  postDescription: string
}

export interface BossHelperAgentJobDetailData {
  job: BossHelperAgentJobDetail
}

export interface BossHelperAgentLogEntry {
  audit?: BossHelperAgentAudit | null
  aiScore?: Record<string, unknown>
  brandName: string
  encryptJobId: string
  error?: string
  jobName: string
  message?: string
  pipelineError?: Record<string, unknown>
  review?: {
    finalDecisionAt?: string
    handledBy?: 'external-agent' | 'system'
    queueDepth?: number
    queueOverflowLimit?: number
    reason?: string
    reasonCode?: string
    replacementCause?: string
    replacementRunId?: string | null
    rating?: number
    status: 'pending' | 'accepted' | 'rejected'
    source?: 'external-ai-review'
    timeoutMs?: number
    timeoutSource?: string
    updatedAt?: string
  } | null
  runId?: string | null
  status: string
  timestamp: string
}

export interface BossHelperAgentLogsQueryData {
  items: BossHelperAgentLogEntry[]
  limit: number
  offset: number
  total: number
}

export interface BossHelperAgentCurrentJob {
  brandName: string
  encryptJobId: string
  jobName: string
  message: string
  status: string
}

export interface BossHelperAgentProgress {
  activeTargetJobIds: string[]
  current: number
  currentJob: BossHelperAgentCurrentJob | null
  locked: boolean
  message: string
  page: number
  pageSize: number
  state: BossHelperAgentState
  stopRequested: boolean
  remainingTargetJobIds: string[]
  total: number
}

export type BossHelperAgentRunState =
  | 'running'
  | 'pausing'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'error'

export interface BossHelperAgentRunDecision {
  at: string
  job: BossHelperAgentCurrentJob | null
  message: string
  type: string
}

export interface BossHelperAgentRunError {
  at: string
  code: string
  job: BossHelperAgentCurrentJob | null
  message: string
}

export interface BossHelperAgentRunRecovery {
  reason: string
  requiresPageReload: boolean
  resumable: boolean
  suggestedAction: BossHelperAgentSuggestedAction
}

export interface BossHelperAgentRunPageSnapshot {
  page: number | null
  pageSize: number | null
  routeKind: string
  url: string
}

export interface BossHelperAgentRunSnapshot {
  activeTargetJobIds: string[]
  analyzedJobIds: string[]
  currentJob: BossHelperAgentCurrentJob | null
  deliveredJobIds: string[]
  finishedAt: string | null
  lastDecision: BossHelperAgentRunDecision | null
  lastError: BossHelperAgentRunError | null
  page: BossHelperAgentRunPageSnapshot
  processedJobIds: string[]
  recovery: BossHelperAgentRunRecovery
  remainingTargetJobIds: string[]
  runId: string
  startedAt: string
  state: BossHelperAgentRunState
  updatedAt: string
}

export interface BossHelperAgentRunSummaryData {
  current: BossHelperAgentRunSnapshot | null
  recent: BossHelperAgentRunSnapshot | null
}

export type BossHelperAgentRiskLevel = 'low' | 'medium' | 'high'
export type BossHelperAgentRiskSeverity = 'info' | 'warn'

export interface BossHelperAgentRiskWarning {
  code: string
  message: string
  severity: BossHelperAgentRiskSeverity
}

export interface BossHelperAgentRiskSummary {
  automation: {
    aiFilteringEnabled: boolean
    aiFilteringExternal: boolean
  }
  delivery: {
    limit: number
    reached: boolean
    remainingToday: number
    remainingInRun: number
    runLimit: number
    runReached: boolean
    usedInRun: number
    usedToday: number
  }
  guardrails: {
    friendStatus: boolean
    notification: boolean
    sameCompanyFilter: boolean
    sameHrFilter: boolean
    useCache: boolean
  }
  level: BossHelperAgentRiskLevel
  observed: {
    deliveredToday: number
    processedToday: number
    repeatFilteredToday: number
    sessionDuplicates: {
      communicated: number
      other: number
      sameCompany: number
      sameHr: number
    }
  }
  runtime: {
    state: BossHelperAgentState
    stopRequested: boolean
  }
  warnings: BossHelperAgentRiskWarning[]
}

export interface BossHelperAgentExecutionPreflight {
  command: 'resume' | 'start'
  configPatchKeys: string[]
  reason: string
  requiresConfirmHighRisk: boolean
  risk: BossHelperAgentRiskSummary
  summary: {
    currentRunId: string | null
    currentRunState: BossHelperAgentRunState | null
    remainingDeliveryCapacity: number
    resumableRun: boolean
    targetJobCount: number
  }
}

export interface BossHelperAgentStatsData {
  historyData: Statistics[]
  preflight?: BossHelperAgentExecutionPreflight
  progress: BossHelperAgentProgress
  risk: BossHelperAgentRiskSummary
  run: BossHelperAgentRunSummaryData
  todayData: Statistics
}
