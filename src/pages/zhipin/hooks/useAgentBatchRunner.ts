import { ElMessage } from 'element-plus'

import { type BossHelperAgentStartPayload } from '@/message/agent'
import { useAgentRuntime } from '@/stores/agent'
import { useCommon } from '@/stores/common'
import { useConf } from '@/stores/conf'
import { jobList } from '@/stores/jobs'
import { useLog } from '@/stores/log'
import { useStatistics } from '@/stores/statistics'
import { delay, notification } from '@/utils'
import { logger } from '@/utils/logger'

import { applyAgentBatchStartPayload } from '../services/agentBatchPayload'
import { resetJobStatuses } from '../shared/jobMapping'
import { executeAgentBatchLoop } from './agentBatchLoop'
import { abortAllPendingAIFilterReviews } from './agentReview'
import { useAgentBatchEvents } from './useAgentBatchEvents'
import {
  createCurrentProgressSnapshot,
  createResponseHelpers,
  createStatsDataGetter,
} from './useAgentBatchState'
import { useDeliver } from './useDeliver'
import { usePager } from './usePager'

interface UseAgentBatchRunnerOptions {
  ensureStoresLoaded: () => Promise<void>
  ensureSupportedPage: () => boolean
}

/**
 * 协调 start / pause / resume / stop 四类批处理命令。
 *
 * 这里不直接处理单岗位逻辑，而是维护整轮投递的生命周期、状态广播、
 * 定向岗位集合和批处理 Promise，确保 UI 与 agent 命令看到的是同一状态机。
 */
export function useAgentBatchRunner(options: UseAgentBatchRunnerOptions) {
  const agentRuntime = useAgentRuntime()
  const common = useCommon()
  const conf = useConf()
  const deliver = useDeliver()
  const log = useLog()
  const { next, page } = usePager()
  const statistics = useStatistics()

  const currentProgressSnapshot = createCurrentProgressSnapshot({
    agentRuntime,
    common,
    deliver,
    page,
  })

  const batchEvents = useAgentBatchEvents({
    common,
    currentProgressSnapshot,
  })

  function clearTargetJobState() {
    agentRuntime.clearTargetJobState()
  }

  async function applyStartPayload(payload?: BossHelperAgentStartPayload) {
    await applyAgentBatchStartPayload({
      agentRuntime,
      conf,
      payload,
    })
  }

  const getStatsData = createStatsDataGetter({
    agentRuntime,
    common,
    deliver,
    page,
    statistics,
  })
  const { ok, fail } = createResponseHelpers(getStatsData)
  let startPending = false

  async function runBatch(mode: 'start' | 'resume', options?: BossHelperAgentStartPayload) {
    common.deliverLock = true
    common.deliverStop = false
    agentRuntime.setStopRequestedByCommand(false)
    batchEvents.setDeliverState(
      'running',
      mode === 'resume'
        ? '投递已恢复'
        : agentRuntime.activeTargetJobIds.length > 0
          ? `定向投递进行中，目标 ${agentRuntime.activeTargetJobIds.length} 个岗位`
          : '投递进行中',
    )
    batchEvents.emitBatchStarted(mode, agentRuntime.activeTargetJobIds.length)

    let stepMsg = mode === 'resume' ? '投递已恢复' : '投递结束'
    let failed = false

    try {
      logger.debug(`${mode} batch`, page)
      const result = await executeAgentBatchLoop({
        activeTargetJobIds: [...agentRuntime.activeTargetJobIds],
        consumeSeenJobIds: (seenJobIds) => agentRuntime.consumeSeenJobIds(seenJobIds),
        delayDeliveryPageNextMs: conf.formData.delay.deliveryPageNext,
        delayDeliveryStartsMs: conf.formData.delay.deliveryStarts,
        getNow: () => Date.now(),
        getJobList: () => jobList.list,
        getLocationHref: () => location.href,
        maxIterations: Math.max(agentRuntime.activeTargetJobIds.length * 5, 300),
        maxRuntimeMs: Math.max(
          conf.formData.delay.deliveryPageNext * 1000 * 10,
          3 * 60 * 60 * 1000,
        ),
        getRemainingTargetJobIds: () => [...agentRuntime.remainingTargetJobIds],
        goNextPage: () => next(),
        handleJobList: (loopOptions) => deliver.jobListHandle(loopOptions),
        logDebug: (...args) => logger.debug(...args),
        resetSelectionStatuses: Boolean(options?.resetFiltered),
        shouldStop: () => common.deliverStop,
        wait: async (ms) => {
          await delay(ms)
        },
      })
      stepMsg = result.stepMsg
    } catch (error) {
      failed = true
      logger.error('获取失败', error)
      stepMsg = `获取失败! - ${error instanceof Error ? error.message : String(error)}`
    } finally {
      logger.debug('日志信息', log.data)
      conf.formData.notification.value && (await notification(stepMsg))
      ElMessage.info(stepMsg)
      common.deliverLock = false

      if (failed) {
        agentRuntime.setStopRequestedByCommand(false)
        batchEvents.setDeliverState('error', stepMsg)
        batchEvents.emitBatchError(stepMsg)
        clearTargetJobState()
      } else if (common.deliverStop) {
        if (agentRuntime.stopRequestedByCommand) {
          agentRuntime.setStopRequestedByCommand(false)
          common.deliverStop = false
          clearTargetJobState()
          batchEvents.setDeliverState('idle', '投递任务已停止')
          batchEvents.emitBatchStopped()
        } else {
          batchEvents.setDeliverState('paused', stepMsg)
          batchEvents.emitBatchPaused(stepMsg)
        }
      } else {
        agentRuntime.setStopRequestedByCommand(false)
        batchEvents.setDeliverState('completed', stepMsg)
        batchEvents.emitBatchCompleted(stepMsg)
        clearTargetJobState()
      }
    }
  }

  function resetFilter() {
    resetJobStatuses(jobList.list, (job) => job.status.status !== 'success')
  }

  async function startBatch(payload?: BossHelperAgentStartPayload) {
    if (startPending || common.deliverLock || agentRuntime.hasPendingBatch) {
      return fail('already-running', '当前已有进行中的投递任务')
    }

    startPending = true

    try {
      common.deliverLock = true
      await options.ensureStoresLoaded()
      if (!options.ensureSupportedPage()) {
        common.deliverLock = false
        return fail('unsupported-page', '当前页面不支持自动投递')
      }
      if (agentRuntime.hasPendingBatch) {
        common.deliverLock = false
        return fail('already-running', '当前已有进行中的投递任务')
      }
      if (common.deliverState === 'paused') {
        common.deliverLock = false
        return fail('paused', '当前任务已暂停，请调用 resume 继续执行')
      }

      await applyStartPayload(payload)

      agentRuntime.setBatchPromise(
        runBatch('start', payload).finally(() => {
          agentRuntime.setBatchPromise(null)
        }),
      )
      return ok(
        'started',
        agentRuntime.activeTargetJobIds.length > 0
          ? `定向投递任务已启动，目标 ${agentRuntime.activeTargetJobIds.length} 个岗位`
          : '投递任务已启动',
      )
    } catch (error) {
      common.deliverLock = false
      throw error
    } finally {
      startPending = false
    }
  }

  async function pauseBatch() {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }
    if (common.deliverState === 'paused') {
      return ok('already-paused', '当前任务已经暂停')
    }
    if (!common.deliverLock) {
      return fail('not-running', '当前没有进行中的投递任务')
    }

    common.deliverStop = true
    batchEvents.setDeliverState('pausing', '正在暂停，等待当前岗位处理完成')
    batchEvents.emitBatchPausing('正在暂停，等待当前岗位处理完成')
    return ok('pause-requested', '已发出暂停指令')
  }

  async function resumeBatch() {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }
    if (common.deliverLock || agentRuntime.hasPendingBatch) {
      return fail('already-running', '当前已有进行中的投递任务')
    }
    if (common.deliverState !== 'paused') {
      return fail('not-paused', '当前任务不处于暂停状态')
    }

    agentRuntime.setBatchPromise(
      runBatch('resume').finally(() => {
        agentRuntime.setBatchPromise(null)
      }),
    )
    return ok('resumed', '投递任务已恢复')
  }

  async function stopBatch() {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }

    if (common.deliverState === 'idle' && !common.deliverLock && !agentRuntime.hasPendingBatch) {
      clearTargetJobState()
      common.deliverStop = false
      agentRuntime.setStopRequestedByCommand(false)
      return ok('already-stopped', '当前没有进行中的投递任务')
    }

    if (common.deliverState === 'paused' && !common.deliverLock && !agentRuntime.hasPendingBatch) {
      clearTargetJobState()
      common.deliverStop = false
      agentRuntime.setStopRequestedByCommand(false)
      batchEvents.setDeliverState('idle', '投递任务已停止')
      batchEvents.emitBatchStopped()
      return ok('stopped', '投递任务已停止')
    }

    agentRuntime.setStopRequestedByCommand(true)
    common.deliverStop = true
    abortAllPendingAIFilterReviews('任务已停止')
    batchEvents.setDeliverState('pausing', '正在停止，等待当前岗位处理完成')
    batchEvents.emitBatchPausing('正在停止，等待当前岗位处理完成', 'stop-command')

    if (agentRuntime.batchPromise) {
      await agentRuntime.batchPromise
    }

    return ok('stopped', '投递任务已停止')
  }

  async function stats() {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }

    return ok('stats', '已返回当前状态')
  }

  return {
    currentProgressSnapshot,
    getStatsData,
    resetFilter,
    startBatch,
    pauseBatch,
    resumeBatch,
    stopBatch,
    stats,
  }
}
