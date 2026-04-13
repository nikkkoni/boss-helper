import type {
  BossHelperAgentCurrentJob,
  BossHelperAgentResponse,
  BossHelperAgentResponseMeta,
  BossHelperAgentStatsData,
} from '@/message/agent'
import { createBossHelperAgentResponse } from '@/message/agent'
import type { useAgentRuntime } from '@/stores/agent'
import type { useCommon } from '@/stores/common'
import type { useStatistics } from '@/stores/statistics'
import { jsonClone } from '@/utils/deepmerge'

import { toAgentCurrentJob } from '../shared/jobMapping'
import { buildAgentRiskSummary } from '../shared/riskSummary'
import type { useDeliver } from './useDeliver'
import type { usePager } from './usePager'

/**
 * 读取当前岗位的对外快照表示。
 */
export function currentJobSnapshot(
  currentData: ReturnType<typeof useDeliver>['currentData'],
): BossHelperAgentCurrentJob | null {
  return toAgentCurrentJob(currentData)
}

/**
 * 构造一个无副作用的运行进度读取器，供高频 agent 事件广播复用。
 */
export function createCurrentProgressSnapshot(options: {
  agentRuntime: ReturnType<typeof useAgentRuntime>
  common: ReturnType<typeof useCommon>
  deliver: ReturnType<typeof useDeliver>
  page: ReturnType<typeof usePager>['page']
}) {
  return () => ({
    activeTargetJobIds: [...options.agentRuntime.activeTargetJobIds],
    current:
      options.deliver.total > 0 ? Math.min(options.deliver.current + 1, options.deliver.total) : 0,
    currentJob: currentJobSnapshot(options.deliver.currentData),
    locked: options.common.deliverLock,
    message: options.common.deliverStatusMessage,
    page: options.page.page,
    pageSize: options.page.pageSize,
    remainingTargetJobIds: [...options.agentRuntime.remainingTargetJobIds],
    state: options.common.deliverState,
    stopRequested: options.common.deliverStop,
    total: options.deliver.total,
  })
}

/**
 * 构造 `stats`、`start`、`pause` 等命令共用的统计读取器。
 *
 * 每次调用都会先刷新统计 store，再返回适合对外暴露的结构化数据。
 */
export function createStatsDataGetter(options: {
  agentRuntime: ReturnType<typeof useAgentRuntime>
  common: ReturnType<typeof useCommon>
  conf: {
    formData: Record<string, unknown>
  }
  deliver: ReturnType<typeof useDeliver>
  page: ReturnType<typeof usePager>['page']
  statistics: ReturnType<typeof useStatistics>
}) {
  return async (): Promise<BossHelperAgentStatsData> => {
    await options.agentRuntime.ensureRunSummaryLoaded()
    await options.statistics.updateStatistics()

    const progress = {
      activeTargetJobIds: [...options.agentRuntime.activeTargetJobIds],
      state: options.common.deliverState,
      locked: options.common.deliverLock,
      stopRequested: options.common.deliverStop,
      page: options.page.page,
      pageSize: options.page.pageSize,
      total: options.deliver.total,
      current:
        options.deliver.total > 0
          ? Math.min(options.deliver.current + 1, options.deliver.total)
          : 0,
      message: options.common.deliverStatusMessage,
      currentJob: currentJobSnapshot(options.deliver.currentData),
      remainingTargetJobIds: [...options.agentRuntime.remainingTargetJobIds],
    }

    await options.agentRuntime.updateRunProgress(progress)

    const run = options.agentRuntime.getRunSummarySnapshot()

    return {
      progress,
      risk: buildAgentRiskSummary({
        config: options.conf.formData,
        failureGuardrail: options.agentRuntime.getFailureGuardrailSnapshot(),
        progress,
        run,
        todayData: options.statistics.todayData,
      }),
      run,
      todayData: jsonClone(options.statistics.todayData),
      historyData: jsonClone(options.statistics.statisticsData),
    }
  }
}

/**
 * 统一包装 agent 响应体，确保成功/失败响应都附带最新统计快照。
 */
export function createResponseHelpers(getStatsData: () => Promise<BossHelperAgentStatsData>) {
  return {
    async ok(
      code: string,
      message: string,
      meta?: BossHelperAgentResponseMeta,
    ): Promise<BossHelperAgentResponse> {
      return createBossHelperAgentResponse(true, code, message, await getStatsData(), meta)
    },
    async fail(
      code: string,
      message: string,
      meta?: BossHelperAgentResponseMeta,
    ): Promise<BossHelperAgentResponse> {
      return createBossHelperAgentResponse(false, code, message, await getStatsData(), meta)
    },
  }
}
