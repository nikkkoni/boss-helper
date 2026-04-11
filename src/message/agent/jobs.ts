import type { Statistics } from '@/types/formData'

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
  aiScore?: Record<string, unknown>
  brandName: string
  encryptJobId: string
  error?: string
  greeting?: string
  jobName: string
  message?: string
  pipelineError?: Record<string, unknown>
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

export interface BossHelperAgentStatsData {
  historyData: Statistics[]
  progress: BossHelperAgentProgress
  todayData: Statistics
}
