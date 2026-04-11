import type {
  BossHelperAgentChatHistoryPayload,
  BossHelperAgentChatListPayload,
  BossHelperAgentChatSendPayload,
  BossHelperAgentConfigUpdatePayload,
  BossHelperAgentJobDetailPayload,
  BossHelperAgentJobReviewPayload,
  BossHelperAgentJobsListPayload,
  BossHelperAgentLogsQueryPayload,
  BossHelperAgentNavigatePayload,
  BossHelperAgentRequest,
  BossHelperAgentStartPayload,
} from './commands'
import type {
  BossHelperAgentChatHistoryData,
  BossHelperAgentChatListData,
  BossHelperAgentConfigSnapshot,
  BossHelperAgentConfigUpdateData,
  BossHelperAgentJobDetailData,
  BossHelperAgentJobsListData,
  BossHelperAgentLogsQueryData,
  BossHelperAgentNavigateData,
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
  jobsReview: (payload: BossHelperAgentJobReviewPayload) => Promise<BossHelperAgentResponse>
  logsQuery: (
    payload?: BossHelperAgentLogsQueryPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentLogsQueryData>>
  navigate: (
    payload?: BossHelperAgentNavigatePayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentNavigateData>>
  chatHistory: (
    payload: BossHelperAgentChatHistoryPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentChatHistoryData>>
  chatList: (
    payload?: BossHelperAgentChatListPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentChatListData>>
  chatSend: (payload: BossHelperAgentChatSendPayload) => Promise<BossHelperAgentResponse>
  pause: () => Promise<BossHelperAgentResponse>
  resume: () => Promise<BossHelperAgentResponse>
  resumeGet: () => Promise<BossHelperAgentResponse<BossHelperAgentResumeData>>
  start: (payload?: BossHelperAgentStartPayload) => Promise<BossHelperAgentResponse>
  stop: () => Promise<BossHelperAgentResponse>
  stats: () => Promise<BossHelperAgentResponse>
}
