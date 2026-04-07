import { ElMessage } from 'element-plus'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { cachePipelineResult, createHandle, sendPublishReq } from '@/composables/useApplying'
import { useCommon } from '@/composables/useCommon'
import { useStatistics } from '@/composables/useStatistics'
import { AIFilteringError, type AIFilteringScoreDetail } from '@/types/deliverError'
import { useConf } from '@/stores/conf'
import type { MyJobListData } from '@/stores/jobs'
import { jobList } from '@/stores/jobs'
import type { logData, logErr } from '@/stores/log'
import { useLog } from '@/stores/log'
import type { BossHelperAgentCurrentJob } from '@/message/agent'
import { BoosHelperError, LimitError, RateLimitError, UnknownError } from '@/types/deliverError'
import { delay, getCurDay, notification } from '@/utils'
import { logger } from '@/utils/logger'

import { createBossHelperAgentEvent, emitBossHelperAgentEvent } from './agentEvents'

interface JobListHandleOptions {
  resetSelectionStatuses?: boolean
  selectedJobIds?: string[]
}

interface JobListHandleResult {
  candidateCount: number
  seenJobIds: string[]
}

function createHandleResult(candidateCount: number, seenJobIds: string[]): JobListHandleResult {
  return {
    candidateCount,
    seenJobIds,
  }
}

function createDailyStatisticsSnapshot(date: string) {
  return {
    date,
    success: 0,
    total: 0,
    company: 0,
    jobTitle: 0,
    jobContent: 0,
    aiFiltering: 0,
    hrPosition: 0,
    salaryRange: 0,
    companySizeRange: 0,
    activityFilter: 0,
    goldHunterFilter: 0,
    repeat: 0,
    jobAddress: 0,
    amap: 0,
  }
}

export const useDeliver = defineStore('zhipin/deliver', () => {
  const total = ref(0)
  const current = ref(0)
  const currentData = ref<MyJobListData>()
  const log = useLog()
  const statistics = useStatistics()
  const common = useCommon()
  const conf = useConf()

  function toAgentJobSnapshot(data: MyJobListData): BossHelperAgentCurrentJob {
    return {
      encryptJobId: data.encryptJobId,
      jobName: data.jobName ?? '',
      brandName: data.brandName ?? '',
      status: data.status.status,
      message: data.status.msg ?? '',
    }
  }

  function normalizeDeliverError(error: unknown): BoosHelperError {
    if (error instanceof BoosHelperError) {
      return error
    }

    const message = error instanceof Error ? error.message : String(error)
    return new UnknownError(`预期外:${message}`, {
      cause: error instanceof Error ? error : undefined,
    })
  }

  async function handleSuccess(
    data: MyJobListData,
    ctx: logData,
    candidateCount: number,
    seenJobIds: string[],
  ): Promise<JobListHandleResult | null> {
    log.add(data, null, ctx, ctx.message)
    statistics.todayData.success++
    data.status.setStatus('success', '投递成功')
    logger.debug('投递成功', ctx)
    ctx.state = '成功'
    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type: 'job-succeeded',
        state: common.deliverState,
        message: `投递成功: ${data.jobName || data.encryptJobId}`,
        job: toAgentJobSnapshot(data),
        progress: {
          current: current.value + 1,
          total: candidateCount,
        },
        detail: ctx.message ? { greeting: ctx.message } : undefined,
      }),
    )

    if (statistics.todayData.success >= conf.formData.deliveryLimit.value) {
      const msg = `投递到达上限 ${conf.formData.deliveryLimit.value}，已暂停投递`
      conf.formData.notification.value && (await notification(msg))
      ElMessage.info(msg)
      common.deliverStop = true
      emitBossHelperAgentEvent(
        createBossHelperAgentEvent({
          type: 'limit-reached',
          state: 'pausing',
          message: msg,
          job: toAgentJobSnapshot(data),
          progress: {
            current: current.value + 1,
            total: candidateCount,
          },
          detail: {
            source: 'delivery-limit',
            limit: conf.formData.deliveryLimit.value,
          },
        }),
      )
      return createHandleResult(candidateCount, seenJobIds)
    }

    const date = getCurDay()
    if (statistics.todayData.date !== date) {
      await statistics.updateStatistics(createDailyStatisticsSnapshot(date))
    }

    return null
  }

  async function handleFailure(
    data: MyJobListData,
    error: unknown,
    ctx: logData,
    candidateCount: number,
    seenJobIds: string[],
  ): Promise<JobListHandleResult | null> {
    const deliverError = normalizeDeliverError(error)
    const aiScoreDetail =
      deliverError instanceof AIFilteringError ? deliverError.aiScore ?? (ctx.aiFilteringScore as AIFilteringScoreDetail | undefined) : undefined

    data.status.setStatus(
      deliverError.state === 'warning' ? 'warn' : 'error',
      deliverError.name || '没有消息',
    )
    log.add(data, deliverError as logErr, ctx)
    logger.warn('投递过滤', ctx)
    ctx.state = '过滤'
    ctx.err = deliverError.message ?? ''
    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type: deliverError.state === 'warning' ? 'job-filtered' : 'job-failed',
        state: common.deliverState,
        message: `${deliverError.name}: ${deliverError.message}`,
        job: toAgentJobSnapshot(data),
        progress: {
          current: current.value + 1,
          total: candidateCount,
        },
        detail: {
          errorName: deliverError.name,
          errorMessage: deliverError.message,
          ...(aiScoreDetail ? { aiScore: aiScoreDetail } : {}),
        },
      }),
    )

    if (deliverError instanceof LimitError) {
      const msg = `投递到达boss上限 ${deliverError.message}，已暂停投递`
      conf.formData.notification.value && (await notification(msg))
      ElMessage.error(msg)
      common.deliverStop = true
      emitBossHelperAgentEvent(
        createBossHelperAgentEvent({
          type: 'limit-reached',
          state: 'pausing',
          message: msg,
          job: toAgentJobSnapshot(data),
          progress: {
            current: current.value + 1,
            total: candidateCount,
          },
          detail: {
            source: 'boss-limit',
            errorMessage: deliverError.message,
          },
        }),
      )
      return createHandleResult(candidateCount, seenJobIds)
    }

    if (deliverError instanceof RateLimitError) {
      conf.formData.delay.deliveryInterval += 3
      const msg = `触发boss速率限制,操作频繁, 建议增加投递间隔. 已临时增加3s间隔`
      conf.formData.notification.value && (await notification(msg))
      ElMessage.error(msg)
      emitBossHelperAgentEvent(
        createBossHelperAgentEvent({
          type: 'rate-limited',
          state: common.deliverState,
          message: msg,
          job: toAgentJobSnapshot(data),
          progress: {
            current: current.value + 1,
            total: candidateCount,
          },
          detail: {
            retryDelaySeconds: 30,
            addedIntervalSeconds: 3,
          },
        }),
      )
      await delay(30)
    }

    return null
  }

  async function processJob(
    data: MyJobListData,
    chandle: Awaited<ReturnType<typeof createHandle>>,
    candidateCount: number,
    seenJobIds: string[],
  ): Promise<JobListHandleResult | null> {
    const ctx: logData = { listData: data }
    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type: 'job-started',
        state: common.deliverState,
        message: `开始处理岗位: ${data.jobName || data.encryptJobId}`,
        job: toAgentJobSnapshot(data),
        progress: {
          current: current.value + 1,
          total: candidateCount,
        },
      }),
    )

    try {
      for (const h of chandle.before) {
        await h({ data }, ctx)
      }
      await sendPublishReq(data)
      for (const h of chandle.after) {
        await h({ data }, ctx)
      }

      return await handleSuccess(data, ctx, candidateCount, seenJobIds)
    } catch (error) {
      return handleFailure(data, error, ctx, candidateCount, seenJobIds)
    }
  }

  async function jobListHandle(options: JobListHandleOptions = {}): Promise<JobListHandleResult> {
    const selectedJobIds = options.selectedJobIds?.length ? new Set(options.selectedJobIds) : null
    const targetJobList = selectedJobIds
      ? jobList._list.value.filter((item) => selectedJobIds.has(item.encryptJobId))
      : jobList._list.value

    log.info(
      '获取岗位',
      selectedJobIds
        ? `本次获取到 ${jobList._list.value.length} 个，命中定向岗位 ${targetJobList.length} 个`
        : `本次获取到 ${targetJobList.length} 个`,
    )
    total.value = targetJobList.length
    const chandle = await createHandle()
    const seenJobIds = targetJobList.map((item) => item.encryptJobId)

    const shouldResetStatus = (item: MyJobListData) => {
      return !selectedJobIds || (options.resetSelectionStatuses && selectedJobIds.has(item.encryptJobId))
    }

    jobList._list.value.forEach((v) => {
      if (!shouldResetStatus(v)) {
        return
      }
      switch (v.status.status) {
        case 'success':
        case 'warn':
          break
        case 'pending':
        case 'wait':
        case 'running':
        case 'error':
        default:
          v.status.setStatus('wait', '等待中')
      }
    })

    for (const [index, data] of targetJobList.entries()) {
      current.value = index
      if (common.deliverStop) {
        log.info('暂停投递', `剩余 ${targetJobList.length - index} 个未处理`)
        return createHandleResult(targetJobList.length, seenJobIds)
      }
      if (data.status.status !== 'wait') continue

      let stopResult: JobListHandleResult | null = null
      try {
        data.status.setStatus('running', '处理中')
        currentData.value = data
        stopResult = await processJob(data, chandle, targetJobList.length, seenJobIds)
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
            job: toAgentJobSnapshot(data),
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
        // 缓存Pipeline处理结果
        try {
          await cachePipelineResult(
            data.encryptJobId,
            data.jobName || '',
            data.brandName || '',
            data.status.status,
            data.status.msg || '处理完成',
          )
        } catch (cacheError) {
          logger.warn('缓存Pipeline结果失败', cacheError)
        }

        statistics.todayData.total++
        await delay(conf.formData.delay.deliveryInterval)
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
