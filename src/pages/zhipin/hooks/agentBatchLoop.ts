import { runLimitedDOMBatch } from '@/utils/concurrency'

import { getActiveSiteAdapter } from '@/site-adapters'

interface AgentBatchListItem {
  encryptJobId?: string
}

interface AgentBatchHandleResult {
  seenJobIds: string[]
}

interface AgentBatchLoopOptions {
  activeTargetJobIds: string[]
  consumeSeenJobIds: (seenJobIds: string[]) => number
  delayDeliveryPageNextMs: number
  delayDeliveryStartsMs: number
  getNow?: () => number
  getJobList: () => AgentBatchListItem[]
  getLocationHref: () => string
  maxIterations?: number
  maxRuntimeMs?: number
  getRemainingTargetJobIds: () => string[]
  goNextPage: () => boolean
  handleJobList: (options: {
    resetSelectionStatuses: boolean
    selectedJobIds?: string[]
  }) => Promise<AgentBatchHandleResult>
  logDebug: (...args: unknown[]) => void
  resetSelectionStatuses: boolean
  shouldStop: () => boolean
  wait: (ms: number) => Promise<void>
}

export async function executeAgentBatchLoop(options: AgentBatchLoopOptions) {
  let stepMsg = '投递结束'
  let resetSelectionStatuses = options.resetSelectionStatuses
  let oldLen = 0
  let oldFirstJobId = ''
  let iteration = 0
  const getNow = options.getNow ?? (() => Date.now())
  const startAt = getNow()
  const maxIterations = Math.max(options.maxIterations ?? 100, 1)
  const maxRuntimeMs = Math.max(options.maxRuntimeMs ?? 30 * 60 * 1000, 1000)

  options.logDebug('batch loop start')

  while (!options.shouldStop()) {
    iteration++
    if (iteration > maxIterations) {
      stepMsg = `投递结束, 达到最大循环次数 ${maxIterations}`
      break
    }

    if (getNow() - startAt >= maxRuntimeMs) {
      stepMsg = `投递结束, 达到最大运行时长 ${Math.floor(maxRuntimeMs / 1000)} 秒`
      break
    }

    const remainingTargetJobIds = options.getRemainingTargetJobIds()
    if (remainingTargetJobIds.length === 0 && options.activeTargetJobIds.length > 0) {
      stepMsg = `定向投递完成，共处理 ${options.activeTargetJobIds.length} 个目标岗位`
      break
    }

    await options.wait(options.delayDeliveryStartsMs)
    const jobs = options.getJobList()
    if (jobs.length === 0) {
      stepMsg = '投递结束, job列表为空'
      break
    }

    const currentFirstJobId = jobs[0]?.encryptJobId ?? ''
    const locationHref = options.getLocationHref()
    if (
      getActiveSiteAdapter(locationHref).shouldStopOnRepeatedJobList(new URL(locationHref).pathname)
      && oldLen === jobs.length
      && oldFirstJobId === currentFirstJobId
    ) {
      stepMsg = '投递结束, 未能获取更多岗位(job列表无变化)'
      break
    }

    oldLen = jobs.length
    oldFirstJobId = currentFirstJobId

    const result = await runLimitedDOMBatch(() =>
      options.handleJobList({
        selectedJobIds: remainingTargetJobIds.length > 0 ? remainingTargetJobIds : undefined,
        resetSelectionStatuses,
      }),
    )
    resetSelectionStatuses = false

    if (remainingTargetJobIds.length > 0 && result.seenJobIds.length > 0) {
      const remainingCount = options.consumeSeenJobIds(result.seenJobIds)
      if (remainingCount === 0) {
        stepMsg = `定向投递完成，共处理 ${options.activeTargetJobIds.length} 个目标岗位`
        break
      }
    }

    if (options.shouldStop()) {
      stepMsg = '投递已暂停'
      break
    }

    await options.wait(options.delayDeliveryPageNextMs)
    const hasNextPage = await runLimitedDOMBatch(async () => options.goNextPage())
    if (!hasNextPage) {
      stepMsg =
        options.getRemainingTargetJobIds().length > 0
          ? `定向投递结束，仍有 ${options.getRemainingTargetJobIds().length} 个目标岗位未命中`
          : '投递结束, 无法继续下一页'
      break
    }
  }

  return { stepMsg }
}
