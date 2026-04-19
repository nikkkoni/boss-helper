import type {
  BossHelperAgentConfigUpdatePayload,
  BossHelperAgentJobCurrentPayload,
  BossHelperAgentJobDetailPayload,
  BossHelperAgentJobReviewPayload,
  BossHelperAgentJobsListPayload,
  BossHelperAgentLogsQueryPayload,
  BossHelperAgentNavigatePayload,
  BossHelperAgentPlanPreviewPayload,
  BossHelperAgentResumePayload,
  BossHelperAgentRequest,
  BossHelperAgentStartPayload,
} from './commands'
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
} from './types'

export interface BossHelperAgentController {
  configGet: () => Promise<BossHelperAgentResponse<BossHelperAgentConfigSnapshot>>
  configUpdate: (
    payload: BossHelperAgentConfigUpdatePayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentConfigUpdateData>>
  handle: (request: BossHelperAgentRequest) => Promise<BossHelperAgentResponse<unknown>>
  jobsDetail: (
    payload: BossHelperAgentJobDetailPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentJobDetailData>>
  jobsList: (
    payload?: BossHelperAgentJobsListPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentJobsListData>>
  jobsCurrent: (
    payload?: BossHelperAgentJobCurrentPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentJobCurrentData>>
  jobsRefresh: () => Promise<BossHelperAgentResponse<BossHelperAgentJobsRefreshData>>
  jobsReview: (payload: BossHelperAgentJobReviewPayload) => Promise<BossHelperAgentResponse>
  logsQuery: (
    payload?: BossHelperAgentLogsQueryPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentLogsQueryData>>
  navigate: (
    payload?: BossHelperAgentNavigatePayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentNavigateData>>
  planPreview: (
    payload?: BossHelperAgentPlanPreviewPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentPlanPreviewData>>
  readinessGet: () => Promise<BossHelperAgentResponse<BossHelperAgentReadinessData>>
  pause: () => Promise<BossHelperAgentResponse>
  resume: (payload?: BossHelperAgentResumePayload) => Promise<BossHelperAgentResponse>
  resumeGet: () => Promise<BossHelperAgentResponse<BossHelperAgentResumeData>>
  start: (payload?: BossHelperAgentStartPayload) => Promise<BossHelperAgentResponse>
  stop: () => Promise<BossHelperAgentResponse>
  stats: () => Promise<BossHelperAgentResponse>
}
