import type {
  BossHelperAgentChatHistoryPayload,
  BossHelperAgentChatListPayload,
  BossHelperAgentChatSendPayload,
  BossHelperAgentConfigUpdatePayload,
  BossHelperAgentController,
  BossHelperAgentJobDetailPayload,
  BossHelperAgentJobReviewPayload,
  BossHelperAgentJobsListPayload,
  BossHelperAgentLogsQueryPayload,
  BossHelperAgentNavigatePayload,
  BossHelperAgentRequest,
  BossHelperAgentStartPayload,
} from '@/message/agent'

import type { useAgentBatchRunner } from './useAgentBatchRunner'
import type { useAgentQueries } from './useAgentQueries'

type AgentBatchRunner = Pick<
  ReturnType<typeof useAgentBatchRunner>,
  'pauseBatch' | 'resumeBatch' | 'startBatch' | 'stats' | 'stopBatch'
>

type AgentQueries = ReturnType<typeof useAgentQueries>

export function createAgentController(options: {
  batchRunner: AgentBatchRunner
  queries: AgentQueries
}): BossHelperAgentController {
  const { batchRunner, queries } = options

  return {
    start: batchRunner.startBatch,
    pause: batchRunner.pauseBatch,
    resume: batchRunner.resumeBatch,
    resumeGet: queries.resumeGet,
    stop: batchRunner.stopBatch,
    stats: batchRunner.stats,
    navigate: queries.navigate,
    chatList: queries.chatList,
    chatHistory: queries.chatHistory,
    chatSend: queries.chatSend,
    jobsReview: queries.jobsReview,
    logsQuery: queries.logsQuery,
    jobsList: queries.jobsList,
    jobsDetail: queries.jobsDetail,
    configGet: queries.getConfig,
    configUpdate: queries.updateConfig,
    async handle(request: BossHelperAgentRequest) {
      switch (request.command) {
        case 'start':
          return batchRunner.startBatch(request.payload as BossHelperAgentStartPayload | undefined)
        case 'pause':
          return batchRunner.pauseBatch()
        case 'resume':
          return batchRunner.resumeBatch()
        case 'resume.get':
          return queries.resumeGet()
        case 'stop':
          return batchRunner.stopBatch()
        case 'stats':
          return batchRunner.stats()
        case 'navigate':
          return queries.navigate(request.payload as BossHelperAgentNavigatePayload | undefined)
        case 'chat.list':
          return queries.chatList(request.payload as BossHelperAgentChatListPayload | undefined)
        case 'chat.history':
          return queries.chatHistory(
            request.payload as BossHelperAgentChatHistoryPayload | undefined,
          )
        case 'chat.send':
          return queries.chatSend(request.payload as BossHelperAgentChatSendPayload | undefined)
        case 'logs.query':
          return queries.logsQuery(request.payload as BossHelperAgentLogsQueryPayload | undefined)
        case 'jobs.list':
          return queries.jobsList(request.payload as BossHelperAgentJobsListPayload | undefined)
        case 'jobs.detail':
          return queries.jobsDetail(request.payload as BossHelperAgentJobDetailPayload | undefined)
        case 'jobs.review':
          return queries.jobsReview(request.payload as BossHelperAgentJobReviewPayload | undefined)
        case 'config.get':
          return queries.getConfig()
        case 'config.update':
          return queries.updateConfig(
            request.payload as BossHelperAgentConfigUpdatePayload | undefined,
          )
      }
    },
  }
}
