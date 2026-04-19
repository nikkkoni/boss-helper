import type { BossHelperAgentCommand } from './commands'
import type {
  BossHelperAgentConfigSnapshot,
  BossHelperAgentConfigUpdateData,
  BossHelperAgentJobCurrentData,
  BossHelperAgentJobDetailData,
  BossHelperAgentJobsListData,
  BossHelperAgentJobsRefreshData,
  BossHelperAgentLogsQueryData,
  BossHelperAgentNavigateData,
  BossHelperAgentPlanPreviewData,
  BossHelperAgentReadinessData,
  BossHelperAgentResponse,
  BossHelperAgentResumeData,
  BossHelperAgentStatsData,
} from './types'

export type BossHelperAgentResponseDataMap = {
  start: BossHelperAgentStatsData
  pause: BossHelperAgentStatsData
  resume: BossHelperAgentStatsData
  'resume.get': BossHelperAgentResumeData
  stop: BossHelperAgentStatsData
  stats: BossHelperAgentStatsData
  'plan.preview': BossHelperAgentPlanPreviewData
  'readiness.get': BossHelperAgentReadinessData
  navigate: BossHelperAgentNavigateData
  'logs.query': BossHelperAgentLogsQueryData
  'jobs.list': BossHelperAgentJobsListData
  'jobs.current': BossHelperAgentJobCurrentData
  'jobs.refresh': BossHelperAgentJobsRefreshData
  'jobs.detail': BossHelperAgentJobDetailData
  'jobs.review': BossHelperAgentStatsData
  'config.get': BossHelperAgentConfigSnapshot
  'config.update': BossHelperAgentConfigUpdateData
}

export type BossHelperAgentCommandResponse<T extends BossHelperAgentCommand> = Promise<
  BossHelperAgentResponse<BossHelperAgentResponseDataMap[T]>
>
