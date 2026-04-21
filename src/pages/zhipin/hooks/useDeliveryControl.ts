import { createBossHelperAgentResponse } from '@/message/agent'
import type {
  BossHelperAgentExecutionPreflight,
  BossHelperAgentResponseMeta,
  BossHelperAgentStatsData,
} from '@/message/agent'
import { isSupportedSiteUrl } from '@/site-adapters'
import { useAgentRuntime } from '@/stores/agent'
import { useConf } from '@/stores/conf'
import { validateConfigPatch } from '@/stores/conf/validation'
import { useLog } from '@/stores/log'
import type { BossHelperAgentResumePayload, BossHelperAgentStartPayload } from '@/message/agent'
import deepmerge, { jsonClone } from '@/utils/deepmerge'

import { createAgentController } from './agentController'
import { onBossHelperAgentEvent } from './agentEvents'
import { registerWindowAgentBridge as setupWindowAgentBridge } from './agentWindowBridge'
import { useAgentBatchRunner } from './useAgentBatchRunner'
import { useAgentQueries } from './useAgentQueries'
import { buildAgentRiskSummary } from '../shared/riskSummary'

let runSummaryTrackingRegistered = false

function normalizeTargetJobIds(jobIds?: string[]) {
  if (!jobIds?.length) {
    return []
  }

  return [...new Set(jobIds.map((jobId) => jobId.trim()).filter(Boolean))]
}

function buildHighRiskStartMessage(_preflight: BossHelperAgentExecutionPreflight) {
  return 'start 属于高风险动作，外部 bridge / CLI / MCP 调用需显式传 confirmHighRisk=true 并先完成上下文检查后才会执行'
}

function buildHighRiskResumeMessage(preflight: BossHelperAgentExecutionPreflight) {
  if (preflight.summary.currentRunState === 'paused') {
    return 'resume 属于高风险动作；当前暂停 run 需先复核 preflight 风险摘要，再显式传 confirmHighRisk=true 后才会继续执行'
  }

  return 'resume 属于高风险动作，外部 bridge / CLI / MCP 调用需显式传 confirmHighRisk=true，并先确认当前暂停 run 仍适合继续后才会执行'
}

function collectStartConfigPatchErrors(payload?: BossHelperAgentStartPayload) {
  if (!payload?.configPatch || Object.keys(payload.configPatch).length === 0) {
    return []
  }

  return validateConfigPatch(payload.configPatch)
}

/**
 * 页面侧 agent 控制器入口。
 *
 * 它把扩展 UI、window bridge、runtime 消息和批处理 runner 统一到同一套命令接口，
 * 这样 `start`、`jobs.list`、`config.update` 等命令无论来自按钮还是外部 agent，
 * 都会走同一套校验和状态更新逻辑。
 */
export function useDeliveryControl() {
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

  async function createExecutionPreflight(
    command: 'resume' | 'start',
    payload?: BossHelperAgentResumePayload | BossHelperAgentStartPayload,
  ): Promise<{ preflight: BossHelperAgentExecutionPreflight; statsData: BossHelperAgentStatsData }> {
    const statsData = await batchRunner.getStatsData()
    const effectiveConfig = jsonClone(conf.formData)
    const startPayload = command === 'start' ? (payload as BossHelperAgentStartPayload | undefined) : undefined
    if (startPayload?.configPatch && Object.keys(startPayload.configPatch).length > 0) {
      deepmerge(effectiveConfig, jsonClone(startPayload.configPatch), { clone: false })
    }

    const risk =
      command === 'start' && startPayload?.configPatch && Object.keys(startPayload.configPatch).length > 0
        ? buildAgentRiskSummary({
            config: effectiveConfig,
            failureGuardrail: agentRuntime.getFailureGuardrailSnapshot(),
            progress: statsData.progress,
            run: statsData.run,
            todayData: statsData.todayData,
          })
        : statsData.risk
    const currentRun = statsData.run.current ?? (statsData.run.recent?.state === 'paused' ? statsData.run.recent : null)
    const configPatchKeys =
      command === 'start' && startPayload?.configPatch
        ? Object.keys(startPayload.configPatch)
        : []
    const targetJobCount =
      command === 'start'
        ? normalizeTargetJobIds(startPayload?.jobIds).length
        : statsData.progress.activeTargetJobIds.length

    const preflight: BossHelperAgentExecutionPreflight = {
      command,
      configPatchKeys,
      reason:
        command === 'resume'
          ? 'resume 会继续一个已暂停的 run，必须先复核当前风险摘要与恢复边界，再显式确认高风险。'
          : 'start 会触发真实执行链路，必须先复核当前风险摘要，再显式确认高风险。',
      requiresConfirmHighRisk: true,
      risk,
      summary: {
        currentRunId: currentRun?.runId ?? null,
        currentRunState: currentRun?.state ?? null,
        remainingDeliveryCapacity: risk.delivery.remainingToday,
        resumableRun: currentRun?.recovery.resumable === true,
        targetJobCount,
      },
    }

    return {
      preflight,
      statsData: {
        ...statsData,
        preflight,
        risk,
      },
    }
  }

  async function startFromAgent(payload?: BossHelperAgentStartPayload) {
    const validationErrors = collectStartConfigPatchErrors(payload)
    if (validationErrors.length > 0) {
      return createBossHelperAgentResponse(
        false,
        'validation-failed',
        '配置校验失败',
        await batchRunner.getStatsData(),
        {
          retryable: false,
          suggestedAction: 'fix-input',
        },
      )
    }

    if (payload?.confirmHighRisk !== true) {
      const { preflight, statsData } = await createExecutionPreflight('start', payload)
      return createBossHelperAgentResponse(
        false,
        'high-risk-action-confirmation-required',
        buildHighRiskStartMessage(preflight),
        statsData,
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
      const { preflight, statsData } = await createExecutionPreflight('resume', payload)
      return createBossHelperAgentResponse(
        false,
        'high-risk-action-confirmation-required',
        buildHighRiskResumeMessage(preflight),
        statsData,
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
