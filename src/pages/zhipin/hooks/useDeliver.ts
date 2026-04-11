import { ElMessage } from 'element-plus'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { cachePipelineResult, createHandle } from '@/composables/useApplying'
import { useCommon } from '@/stores/common'
import { useConf } from '@/stores/conf'
import type { MyJobListData } from '@/stores/jobs'
import { jobList } from '@/stores/jobs'
import { useLog } from '@/stores/log'
import { useStatistics } from '@/stores/statistics'
import { notification } from '@/utils'
import { logger } from '@/utils/logger'

import {
  createHandleResult,
  executeDeliverJob,
  finalizeDeliverIteration,
} from '../services/deliverExecution'
import { resetJobStatuses, toAgentCurrentJob } from '../shared/jobMapping'
import { createBossHelperAgentEvent, emitBossHelperAgentEvent } from './agentEvents'

interface JobListHandleOptions {
  resetSelectionStatuses?: boolean
  selectedJobIds?: string[]
}

interface JobListHandleResult {
  candidateCount: number
  seenJobIds: string[]
}

/**
 * zhipin 页面级 Pinia store。
 *
 * 它依赖当前页面的 host-Vue 绑定与列表状态，因此保留在 `hooks/`，不作为通用 composable 使用。
 */
export const useDeliver = defineStore('zhipin/deliver', () => {
  const total = ref(0)
  const current = ref(0)
  const currentData = ref<MyJobListData>()
  const log = useLog()
  const statistics = useStatistics()
  const common = useCommon()
  const conf = useConf()

  function createDeliverDeps() {
    return {
      cachePipelineResultFn: cachePipelineResult,
      common,
      conf,
      counters: {
        get current() {
          return current.value
        },
      },
      log,
      statistics,
    }
  }

  /**
   * 顺序处理当前页岗位集合。
   *
   * 它会重置候选岗位状态、逐个执行 pipeline 与投递动作，并把成功、失败、
   * 速率限制、中断请求统一落到日志、统计和 agent 事件流中。
   */
  async function jobListHandle(options: JobListHandleOptions = {}): Promise<JobListHandleResult> {
    const selectedJobIds = options.selectedJobIds?.length ? new Set(options.selectedJobIds) : null
    const targetJobList = selectedJobIds
      ? jobList.list.filter((item) => selectedJobIds.has(item.encryptJobId))
      : jobList.list

    log.info(
      '获取岗位',
      selectedJobIds
        ? `本次获取到 ${jobList.list.length} 个，命中定向岗位 ${targetJobList.length} 个`
        : `本次获取到 ${targetJobList.length} 个`,
    )
    total.value = targetJobList.length
    const chandle = await createHandle()
    const seenJobIds = targetJobList.map((item) => item.encryptJobId)

    const shouldResetStatus = (item: MyJobListData) => {
      return (
        !selectedJobIds ||
        Boolean(options.resetSelectionStatuses && selectedJobIds.has(item.encryptJobId))
      )
    }

    resetJobStatuses(jobList.list, shouldResetStatus)

    for (const [index, data] of targetJobList.entries()) {
      current.value = index
      if (common.deliverStop) {
        log.info('暂停投递', `剩余 ${targetJobList.length - index} 个未处理`)
        return createHandleResult(targetJobList.length, seenJobIds)
      }
      if (data.status.status !== 'wait') continue

      let extraDelaySeconds = 0
      let stopResult: JobListHandleResult | null = null
      try {
        data.status.setStatus('running', '处理中')
        currentData.value = data
        const result = await executeDeliverJob({
          cacheResult: createHandleResult(targetJobList.length, seenJobIds),
          chandle,
          data,
          deps: createDeliverDeps(),
        })
        extraDelaySeconds = result.extraDelaySeconds ?? 0
        stopResult = result.stopResult
      } catch (error) {
        data.status.setStatus('error', '未知报错')
        logger.error('未知报错', error, data)
        conf.formData.notification.value && (await notification('未知报错'))
        ElMessage.error('未知报错')
        emitBossHelperAgentEvent(
          createBossHelperAgentEvent({
            type: 'job-failed',
            state: common.deliverState,
            message: `未知报错: ${error instanceof Error ? error.message : String(error)}`,
            job: toAgentCurrentJob(data),
            progress: {
              current: current.value + 1,
              total: targetJobList.length,
            },
            detail: {
              errorMessage: error instanceof Error ? error.message : String(error),
            },
          }),
        )
      } finally {
        await finalizeDeliverIteration({
          cachePipelineResultFn: cachePipelineResult,
          conf,
          data,
          extraDelaySeconds,
          statistics,
        })
      }

      if (stopResult) {
        return stopResult
      }
    }

    return createHandleResult(targetJobList.length, seenJobIds)
  }
  return {
    createHandle,
    jobListHandle,
    total,
    current,
    currentData,
  }
})
