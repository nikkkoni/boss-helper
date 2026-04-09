import type { BossHelperAgentCurrentJob, BossHelperAgentResponse, BossHelperAgentStatsData } from '@/message/agent'
import { createBossHelperAgentResponse } from '@/message/agent'
import type { useAgentRuntime } from '@/stores/agent'
import type { useCommon } from '@/composables/useCommon'
import type { useStatistics } from '@/composables/useStatistics'
import type { usePager } from './usePager'
import type { useDeliver } from './useDeliver'
import { jsonClone } from '@/utils/deepmerge'

import { toAgentCurrentJob } from '../shared/jobMapping'

export function currentJobSnapshot(currentData: ReturnType<typeof useDeliver>['currentData']): BossHelperAgentCurrentJob | null {
  return toAgentCurrentJob(currentData)
}

export function createCurrentProgressSnapshot(options: {
  agentRuntime: ReturnType<typeof useAgentRuntime>
  common: ReturnType<typeof useCommon>
  deliver: ReturnType<typeof useDeliver>
  page: ReturnType<typeof usePager>['page']
}) {
  return () => ({
    activeTargetJobIds: [...options.agentRuntime.activeTargetJobIds],
    current: options.deliver.total > 0 ? Math.min(options.deliver.current + 1, options.deliver.total) : 0,
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

export function createStatsDataGetter(options: {
  agentRuntime: ReturnType<typeof useAgentRuntime>
  common: ReturnType<typeof useCommon>
  deliver: ReturnType<typeof useDeliver>
  page: ReturnType<typeof usePager>['page']
  statistics: ReturnType<typeof useStatistics>
}) {
  return async (): Promise<BossHelperAgentStatsData> => {
    await options.statistics.updateStatistics()

    return {
      progress: {
        activeTargetJobIds: [...options.agentRuntime.activeTargetJobIds],
        state: options.common.deliverState,
        locked: options.common.deliverLock,
        stopRequested: options.common.deliverStop,
        page: options.page.page,
        pageSize: options.page.pageSize,
        total: options.deliver.total,
        current: options.deliver.total > 0 ? Math.min(options.deliver.current + 1, options.deliver.total) : 0,
        message: options.common.deliverStatusMessage,
        currentJob: currentJobSnapshot(options.deliver.currentData),
        remainingTargetJobIds: [...options.agentRuntime.remainingTargetJobIds],
      },
      todayData: jsonClone(options.statistics.todayData),
      historyData: jsonClone(options.statistics.statisticsData),
    }
  }
}

export function createResponseHelpers(getStatsData: () => Promise<BossHelperAgentStatsData>) {
  return {
    async ok(code: string, message: string): Promise<BossHelperAgentResponse> {
      return createBossHelperAgentResponse(true, code, message, await getStatsData())
    },
    async fail(code: string, message: string): Promise<BossHelperAgentResponse> {
      return createBossHelperAgentResponse(false, code, message, await getStatsData())
    },
  }
}
