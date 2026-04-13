import { useChat } from '@/composables/useChat'
import { createBossHelperAgentResponse } from '@/message/agent'
import type { BossHelperAgentResponseMeta } from '@/message/agent'
import { isSupportedSiteUrl } from '@/site-adapters'
import { useAgentRuntime } from '@/stores/agent'
import { useConf } from '@/stores/conf'
import { useLog } from '@/stores/log'
import type { BossHelperAgentResumePayload, BossHelperAgentStartPayload } from '@/message/agent'

import { createAgentController } from './agentController'
import { onBossHelperAgentEvent } from './agentEvents'
import { registerWindowAgentBridge as setupWindowAgentBridge } from './agentWindowBridge'
import { useAgentBatchRunner } from './useAgentBatchRunner'
import { useAgentQueries } from './useAgentQueries'

let runSummaryTrackingRegistered = false

function buildHighRiskStartMessage() {
  return 'start 属于高风险动作，外部 bridge / CLI / MCP 调用需显式传 confirmHighRisk=true 并先完成上下文检查后才会执行'
}

function buildHighRiskResumeMessage() {
  return 'resume 属于高风险动作，外部 bridge / CLI / MCP 调用需显式传 confirmHighRisk=true，并先确认当前暂停 run 仍适合继续后才会执行'
}

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
  const agentRuntime = useAgentRuntime()

  async function ensureStoresLoaded() {
    if (!conf.isLoaded) {
      await conf.confInit()
    }

    await agentRuntime.ensureRunSummaryLoaded()
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
  const ensureSupportedPage = () => isSupportedSiteUrl(location.href)
  const queries = useAgentQueries({
    currentProgressSnapshot,
    ensureStoresLoaded,
    ensureSupportedPage,
    ok: async (code, message, meta?: BossHelperAgentResponseMeta) =>
      createBossHelperAgentResponse(true, code, message, await batchRunner.getStatsData(), meta),
    fail: async (code, message, meta?: BossHelperAgentResponseMeta) =>
      createBossHelperAgentResponse(false, code, message, await batchRunner.getStatsData(), meta),
  })

  if (!runSummaryTrackingRegistered) {
    runSummaryTrackingRegistered = true
    onBossHelperAgentEvent((event) => {
      void agentRuntime.recordEvent(event, currentProgressSnapshot())
    })
  }

  const controller = createAgentController({ batchRunner, queries })

  async function startFromAgent(payload?: BossHelperAgentStartPayload) {
    if (payload?.confirmHighRisk !== true) {
      return createBossHelperAgentResponse(
        false,
        'high-risk-action-confirmation-required',
        buildHighRiskStartMessage(),
        await batchRunner.getStatsData(),
        {
          retryable: false,
          suggestedAction: 'fix-input',
        },
      )
    }

    return batchRunner.startBatch(payload)
  }

  async function resumeFromAgent(payload?: BossHelperAgentResumePayload) {
    if (payload?.confirmHighRisk !== true) {
      return createBossHelperAgentResponse(
        false,
        'high-risk-action-confirmation-required',
        buildHighRiskResumeMessage(),
        await batchRunner.getStatsData(),
        {
          retryable: false,
          suggestedAction: 'fix-input',
        },
      )
    }

    return batchRunner.resumeBatch(payload)
  }

  controller.start = startFromAgent
  controller.resume = resumeFromAgent
  controller.handle = async (request) => {
    switch (request.command) {
      case 'start':
        return startFromAgent(request.payload as BossHelperAgentStartPayload | undefined)
      case 'resume':
        return resumeFromAgent(request.payload as BossHelperAgentResumePayload | undefined)
      default:
        return createAgentController({ batchRunner, queries }).handle(request)
    }
  }

  return {
    controller,
    pauseBatch,
    registerWindowAgentBridge: () =>
      setupWindowAgentBridge({ controller, onEvent: onBossHelperAgentEvent }),
    resetFilter,
    resumeBatch,
    startBatch,
    stopBatch,
    stats,
  }
}
