import { ElMessage } from 'element-plus'

import type { cachePipelineResult, createHandle } from '@/composables/useApplying'
import { getActiveSiteAdapter } from '@/site-adapters'
import type { MyJobListData } from '@/stores/jobs'
import type { logData, logErr } from '@/stores/log'
import {
  AIFilteringError,
  BoosHelperError,
  LimitError,
  RateLimitError,
  type AIFilteringScoreDetail,
  UnknownError,
} from '@/types/deliverError'
import { delay, getCurDay, notification } from '@/utils'
import { logger } from '@/utils/logger'

import { createBossHelperAgentEvent, emitBossHelperAgentEvent } from '../hooks/agentEvents'
import {
  createDailyStatisticsSnapshot,
  toAgentCurrentJob,
} from '../shared/jobMapping'

export interface DeliverJobListHandleResult {
  candidateCount: number
  seenJobIds: string[]
}

export interface DeliverIterationResult {
  extraDelaySeconds?: number
  stopResult: DeliverJobListHandleResult | null
}

export interface DeliverExecutionDependencies {
  cachePipelineResultFn: typeof cachePipelineResult
  common: {
    deliverState: string
    deliverStop: boolean
  }
  conf: {
    formData: {
      delay: {
        deliveryInterval: number
      }
      deliveryLimit: {
        value: number
      }
      notification: {
        value: boolean
      }
    }
  }
  counters: {
    current: number
  }
  log: {
    add: (job: MyJobListData, err: logErr, logdata?: logData, msg?: string) => void
  }
  statistics: {
    todayData: {
      date: string
      success: number
      total: number
    }
    updateStatistics: (curData?: typeof createDailyStatisticsSnapshot extends (...args: any[]) => infer R ? R : never) => Promise<unknown>
  }
}

export function createHandleResult(candidateCount: number, seenJobIds: string[]): DeliverJobListHandleResult {
  return {
    candidateCount,
    seenJobIds,
  }
}

export function normalizeDeliverError(error: unknown): BoosHelperError {
  if (error instanceof BoosHelperError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  return new UnknownError(`预期外:${message}`, {
    cause: error instanceof Error ? error : undefined,
  })
}

export async function handleDeliverSuccess(options: {
  data: MyJobListData
  ctx: logData
  deps: DeliverExecutionDependencies
  result: DeliverJobListHandleResult
}): Promise<DeliverIterationResult> {
  const { data, ctx, deps, result } = options
  deps.log.add(data, null, ctx, ctx.message)
  deps.statistics.todayData.success++
  data.status.setStatus('success', '投递成功')
  logger.debug('投递成功', ctx)
  ctx.state = '成功'
  emitBossHelperAgentEvent(
    createBossHelperAgentEvent({
      type: 'job-succeeded',
      state: deps.common.deliverState as any,
      message: `投递成功: ${data.jobName || data.encryptJobId}`,
      job: toAgentCurrentJob(data),
      progress: {
        current: deps.counters.current + 1,
        total: result.candidateCount,
      },
      detail: ctx.message ? { greeting: ctx.message } : undefined,
    }),
  )

  if (deps.statistics.todayData.success >= deps.conf.formData.deliveryLimit.value) {
    const msg = `投递到达上限 ${deps.conf.formData.deliveryLimit.value}，已暂停投递`
    deps.conf.formData.notification.value && (await notification(msg))
    ElMessage.info(msg)
    deps.common.deliverStop = true
    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type: 'limit-reached',
        state: 'pausing',
        message: msg,
        job: toAgentCurrentJob(data),
        progress: {
          current: deps.counters.current + 1,
          total: result.candidateCount,
        },
        detail: {
          source: 'delivery-limit',
          limit: deps.conf.formData.deliveryLimit.value,
        },
      }),
    )
    return {
      stopResult: result,
    }
  }

  const date = getCurDay()
  if (deps.statistics.todayData.date !== date) {
    await deps.statistics.updateStatistics(createDailyStatisticsSnapshot(date))
  }

  return {
    stopResult: null,
  }
}

export async function handleDeliverFailure(options: {
  data: MyJobListData
  error: unknown
  ctx: logData
  deps: DeliverExecutionDependencies
  result: DeliverJobListHandleResult
}): Promise<DeliverIterationResult> {
  const { data, error, ctx, deps, result } = options
  const deliverError = normalizeDeliverError(error)
  const aiScoreDetail =
    deliverError instanceof AIFilteringError
      ? deliverError.aiScore ?? (ctx.aiFilteringScore as AIFilteringScoreDetail | undefined)
      : undefined

  data.status.setStatus(
    deliverError.state === 'warning' ? 'warn' : 'error',
    deliverError.name || '没有消息',
  )
  deps.log.add(data, deliverError as logErr, ctx)
  logger.warn('投递过滤', ctx)
  ctx.state = '过滤'
  ctx.err = deliverError.message ?? ''
  emitBossHelperAgentEvent(
    createBossHelperAgentEvent({
      type: deliverError.state === 'warning' ? 'job-filtered' : 'job-failed',
      state: deps.common.deliverState as any,
      message: `${deliverError.name}: ${deliverError.message}`,
      job: toAgentCurrentJob(data),
      progress: {
        current: deps.counters.current + 1,
        total: result.candidateCount,
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
    deps.conf.formData.notification.value && (await notification(msg))
    ElMessage.error(msg)
    deps.common.deliverStop = true
    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type: 'limit-reached',
        state: 'pausing',
        message: msg,
        job: toAgentCurrentJob(data),
        progress: {
          current: deps.counters.current + 1,
          total: result.candidateCount,
        },
        detail: {
          source: 'boss-limit',
          errorMessage: deliverError.message,
        },
      }),
    )
    return {
      stopResult: result,
    }
  }

  if (deliverError instanceof RateLimitError) {
    const msg = '触发boss速率限制,操作频繁, 建议增加投递间隔. 已临时增加3s间隔'
    deps.conf.formData.notification.value && (await notification(msg))
    ElMessage.error(msg)
    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type: 'rate-limited',
        state: deps.common.deliverState as any,
        message: msg,
        job: toAgentCurrentJob(data),
        progress: {
          current: deps.counters.current + 1,
          total: result.candidateCount,
        },
        detail: {
          retryDelaySeconds: 30,
          addedIntervalSeconds: 3,
        },
      }),
    )
    await delay(30)

    return {
      extraDelaySeconds: 3,
      stopResult: null,
    }
  }

  return {
    stopResult: null,
  }
}

/**
 * 执行单个岗位的完整投递链路：before pipeline -> apply -> after pipeline。
 *
 * 这里是批处理循环里的最小执行单元，成功和失败都会被规范化为结构化日志、
 * 统计更新和 agent 事件，供 UI 与外部 agent 复用。
 */
export async function executeDeliverJob(options: {
  cacheResult: DeliverJobListHandleResult
  chandle: Awaited<ReturnType<typeof createHandle>>
  data: MyJobListData
  deps: DeliverExecutionDependencies
}): Promise<DeliverIterationResult> {
  const { cacheResult, chandle, data, deps } = options
  const ctx: logData = { listData: data }
  emitBossHelperAgentEvent(
    createBossHelperAgentEvent({
      type: 'job-started',
      state: deps.common.deliverState as any,
      message: `开始处理岗位: ${data.jobName || data.encryptJobId}`,
      job: toAgentCurrentJob(data),
      progress: {
        current: deps.counters.current + 1,
        total: cacheResult.candidateCount,
      },
    }),
  )

  try {
    for (const h of chandle.before) {
      await h({ data }, ctx)
    }

    await getActiveSiteAdapter(location.href).applyToJob(data)

    for (const h of chandle.after) {
      await h({ data }, ctx)
    }

    return await handleDeliverSuccess({
      data,
      ctx,
      deps,
      result: cacheResult,
    })
  } catch (error) {
    return handleDeliverFailure({
      data,
      error,
      ctx,
      deps,
      result: cacheResult,
    })
  }
}

/**
 * 无论单岗位执行成功还是失败，都在迭代末尾更新缓存并执行节流等待。
 */
export async function finalizeDeliverIteration(options: {
  cachePipelineResultFn: typeof cachePipelineResult
  conf: DeliverExecutionDependencies['conf']
  data: MyJobListData
  extraDelaySeconds?: number
  statistics: DeliverExecutionDependencies['statistics']
}) {
  try {
    await options.cachePipelineResultFn(
      options.data.encryptJobId,
      options.data.jobName || '',
      options.data.brandName || '',
      options.data.status.status,
      options.data.status.msg || '处理完成',
    )
  } catch (cacheError) {
    logger.warn('缓存Pipeline结果失败', cacheError)
  }

  options.statistics.todayData.total++
  await delay(options.conf.formData.delay.deliveryInterval + (options.extraDelaySeconds ?? 0))
}
