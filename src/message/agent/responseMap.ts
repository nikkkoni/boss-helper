import type { BossHelperAgentCommand } from './commands'
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
  BossHelperAgentStatsData,
} from './types'

export type BossHelperAgentResponseDataMap = {
  start: BossHelperAgentStatsData
  pause: BossHelperAgentStatsData
  resume: BossHelperAgentStatsData
  'resume.get': BossHelperAgentResumeData
  stop: BossHelperAgentStatsData
  stats: BossHelperAgentStatsData
  navigate: BossHelperAgentNavigateData
  'chat.list': BossHelperAgentChatListData
  'chat.history': BossHelperAgentChatHistoryData
  'chat.send': BossHelperAgentStatsData
  'logs.query': BossHelperAgentLogsQueryData
  'jobs.list': BossHelperAgentJobsListData
  'jobs.detail': BossHelperAgentJobDetailData
  'jobs.review': BossHelperAgentStatsData
  'config.get': BossHelperAgentConfigSnapshot
  'config.update': BossHelperAgentConfigUpdateData
}

export type BossHelperAgentCommandResponse<T extends BossHelperAgentCommand> = Promise<
  BossHelperAgentResponse<BossHelperAgentResponseDataMap[T]>
>
