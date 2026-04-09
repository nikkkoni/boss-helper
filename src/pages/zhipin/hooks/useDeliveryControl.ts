import { useChat } from '@/composables/useChat'
import { isSupportedSiteUrl } from '@/site-adapters'
import { jsonClone } from '@/utils/deepmerge'
import {
  BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
  BOSS_HELPER_AGENT_EVENT_BRIDGE,
  createBossHelperAgentResponse,
  isBossHelperAgentBridgeRequest,
  type BossHelperAgentController,
  type BossHelperAgentRequest,
  type BossHelperAgentChatHistoryPayload,
  type BossHelperAgentChatListPayload,
  type BossHelperAgentChatSendPayload,
  type BossHelperAgentConfigUpdatePayload,
  type BossHelperAgentJobDetailPayload,
  type BossHelperAgentJobReviewPayload,
  type BossHelperAgentJobsListPayload,
  type BossHelperAgentLogsQueryPayload,
  type BossHelperAgentNavigatePayload,
  type BossHelperAgentStartPayload,
} from '@/message/agent'
import { useConf } from '@/stores/conf'
import { useLog } from '@/stores/log'

import { useAgentBatchRunner } from './useAgentBatchRunner'
import { useAgentQueries } from './useAgentQueries'
import { onBossHelperAgentEvent } from './agentEvents'

/**
 * 页面侧 agent 控制器入口。
 *
 * 它把扩展 UI、window bridge、runtime 消息和批处理 runner 统一到同一套命令接口，
 * 这样 `start`、`jobs.list`、`config.update` 等命令无论来自按钮还是外部 agent，
 * 都会走同一套校验和状态更新逻辑。
 */
export function useDeliveryControl() {
  useChat()
  useLog()
  const conf = useConf()

  async function ensureStoresLoaded() {
    if (!conf.isLoaded) {
      await conf.confInit()
    }
  }

  const batchRunner = useAgentBatchRunner({
    ensureStoresLoaded,
    ensureSupportedPage: () => isSupportedSiteUrl(location.href),
  })
  const {
    currentProgressSnapshot,
    pauseBatch,
    resetFilter,
    resumeBatch,
    startBatch,
    stats,
    stopBatch,
  } = batchRunner

  function ensureSupportedPage() {
    return isSupportedSiteUrl(location.href)
  }
  const queries = useAgentQueries({
    currentProgressSnapshot,
    ensureStoresLoaded,
    ensureSupportedPage,
    ok: async (code, message) =>
      createBossHelperAgentResponse(true, code, message, await batchRunner.getStatsData()),
    fail: async (code, message) =>
      createBossHelperAgentResponse(false, code, message, await batchRunner.getStatsData()),
  })

  const controller: BossHelperAgentController = {
    start: startBatch,
    pause: pauseBatch,
    resume: resumeBatch,
    resumeGet: queries.resumeGet,
    stop: stopBatch,
    stats,
    navigate: queries.navigate,
    chatList: queries.chatList,
    chatHistory: queries.chatHistory,
    chatSend: queries.chatSend,
    jobsReview: queries.jobsReview,
    logsQuery: queries.logsQuery,
    jobsList: queries.jobsList,
    jobsDetail: (payload) => queries.jobsDetail(payload),
    configGet: queries.getConfig,
    configUpdate: (payload) => queries.updateConfig(payload),
    async handle(request: BossHelperAgentRequest) {
      switch (request.command) {
        case 'start':
          return startBatch(request.payload as BossHelperAgentStartPayload | undefined)
        case 'pause':
          return pauseBatch()
        case 'resume':
          return resumeBatch()
        case 'resume.get':
          return queries.resumeGet()
        case 'stop':
          return stopBatch()
        case 'stats':
          return stats()
        case 'navigate':
          return queries.navigate(request.payload as BossHelperAgentNavigatePayload | undefined)
        case 'chat.list':
          return queries.chatList(request.payload as BossHelperAgentChatListPayload | undefined)
        case 'chat.history':
          return queries.chatHistory(request.payload as BossHelperAgentChatHistoryPayload | undefined)
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
          return queries.updateConfig(request.payload as BossHelperAgentConfigUpdatePayload | undefined)
      }
    },
  }

  return {
    controller,
    pauseBatch,
    registerWindowAgentBridge() {
      window.__bossHelperAgent = controller
      const stopAgentEventBridge = onBossHelperAgentEvent((payload) => {
        const plainPayload = jsonClone(payload)
        window.postMessage(
          {
            type: BOSS_HELPER_AGENT_EVENT_BRIDGE,
            payload: plainPayload,
          },
          '*',
        )
      })

      const onMessage = (event: MessageEvent) => {
        if (event.source !== window || !isBossHelperAgentBridgeRequest(event.data)) {
          return
        }

        void controller
          .handle(event.data.payload)
          .catch((error) => {
            return createBossHelperAgentResponse(
              false,
              'controller-error',
              error instanceof Error ? error.message : '未知错误',
            )
          })
          .then((payload) => {
            const plainPayload = jsonClone(payload)
            window.postMessage(
              {
                type: BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
                requestId: event.data.requestId,
                payload: plainPayload,
              },
              '*',
            )
          })
      }

      window.addEventListener('message', onMessage)

      return () => {
        stopAgentEventBridge()
        if (window.__bossHelperAgent === controller) {
          delete window.__bossHelperAgent
        }
        window.removeEventListener('message', onMessage)
      }
    },
    resetFilter,
    resumeBatch,
    startBatch,
    stopBatch,
    stats,
  }
}
