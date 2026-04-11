// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupPinia } from './helpers/pinia'

const runnerMocks = vi.hoisted(() => ({
  elMessageInfo: vi.fn(),
  commonStore: {
    deliverLock: false,
    deliverStop: false,
    deliverState: 'idle',
    deliverStatusMessage: '未开始',
  },
  statisticsStore: {
    todayData: { date: '2026-04-10', success: 0, total: 0 },
    statisticsData: [],
    updateStatistics: vi.fn(async () => undefined),
  },
  agentRuntimeStore: {
    batchPromise: null as Promise<void> | null,
    activeTargetJobIds: [] as string[],
    remainingTargetJobIds: [] as string[],
    stopRequestedByCommand: false,
    get hasPendingBatch() {
      return this.batchPromise != null
    },
    setBatchPromise: vi.fn((promise: Promise<void> | null) => {
      runnerMocks.agentRuntimeStore.batchPromise = promise
    }),
    setTargetJobIds: vi.fn((jobIds: string[]) => {
      runnerMocks.agentRuntimeStore.activeTargetJobIds = [...jobIds]
      runnerMocks.agentRuntimeStore.remainingTargetJobIds = [...jobIds]
    }),
    clearTargetJobState: vi.fn(() => {
      runnerMocks.agentRuntimeStore.activeTargetJobIds = []
      runnerMocks.agentRuntimeStore.remainingTargetJobIds = []
    }),
    consumeSeenJobIds: vi.fn((seenJobIds: string[]) => {
      const seen = new Set(seenJobIds)
      runnerMocks.agentRuntimeStore.remainingTargetJobIds = runnerMocks.agentRuntimeStore.remainingTargetJobIds.filter(
        (jobId) => !seen.has(jobId),
      )
      return runnerMocks.agentRuntimeStore.remainingTargetJobIds.length
    }),
    setStopRequestedByCommand: vi.fn((value: boolean) => {
      runnerMocks.agentRuntimeStore.stopRequestedByCommand = value
    }),
  },
  confStore: {
    formData: {
      delay: {
        deliveryPageNext: 1,
        deliveryStarts: 1,
      },
      notification: {
        value: false,
      },
    },
  },
  logStore: {
    data: [],
  },
  pagerStore: {
    next: vi.fn(() => true),
    page: { page: 1, pageSize: 15 },
  },
  deliverStore: {
    jobListHandle: vi.fn(async () => ({ seenJobIds: [] })),
    currentData: null,
    current: 0,
    total: 0,
  },
  delay: vi.fn(async () => undefined),
  notification: vi.fn(async () => undefined),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
  abortAllPendingAIFilterReviews: vi.fn(),
  executeAgentBatchLoop: vi.fn(async (_options?: { shouldStop: () => boolean }) => ({ stepMsg: 'loop completed' })),
  applyAgentBatchStartPayload: vi.fn(async ({ agentRuntime, payload }) => {
    agentRuntime.setTargetJobIds(payload?.jobIds ?? [])
  }),
  batchEvents: {
    setDeliverState: vi.fn((state: string, message: string) => {
      runnerMocks.commonStore.deliverState = state
      runnerMocks.commonStore.deliverStatusMessage = message
    }),
    emitBatchStarted: vi.fn(),
    emitBatchError: vi.fn(),
    emitBatchStopped: vi.fn(),
    emitBatchPaused: vi.fn(),
    emitBatchCompleted: vi.fn(),
    emitBatchPausing: vi.fn(),
  },
  useAgentBatchEvents: vi.fn(() => runnerMocks.batchEvents),
  resetJobStatuses: vi.fn(),
  jobList: {
    list: [] as Array<any>,
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    info: runnerMocks.elMessageInfo,
  },
}))

vi.mock('@/composables/useCommon', () => ({
  useCommon: () => runnerMocks.commonStore,
}))

vi.mock('@/composables/useStatistics', () => ({
  useStatistics: () => runnerMocks.statisticsStore,
}))

vi.mock('@/stores/agent', () => ({
  useAgentRuntime: () => runnerMocks.agentRuntimeStore,
}))

vi.mock('@/stores/conf', () => ({
  useConf: () => runnerMocks.confStore,
}))

vi.mock('@/stores/jobs', () => ({
  jobList: runnerMocks.jobList,
}))

vi.mock('@/stores/log', () => ({
  useLog: () => runnerMocks.logStore,
}))

vi.mock('@/utils', () => ({
  delay: runnerMocks.delay,
  notification: runnerMocks.notification,
}))

vi.mock('@/utils/logger', () => ({
  logger: runnerMocks.logger,
}))

vi.mock('@/pages/zhipin/hooks/agentReview', () => ({
  abortAllPendingAIFilterReviews: runnerMocks.abortAllPendingAIFilterReviews,
}))

vi.mock('@/pages/zhipin/hooks/agentBatchLoop', () => ({
  executeAgentBatchLoop: runnerMocks.executeAgentBatchLoop,
}))

vi.mock('@/pages/zhipin/services/agentBatchPayload', () => ({
  applyAgentBatchStartPayload: runnerMocks.applyAgentBatchStartPayload,
}))

vi.mock('@/pages/zhipin/hooks/useAgentBatchEvents', () => ({
  useAgentBatchEvents: runnerMocks.useAgentBatchEvents,
}))

vi.mock('@/pages/zhipin/hooks/useDeliver', () => ({
  useDeliver: () => runnerMocks.deliverStore,
}))

vi.mock('@/pages/zhipin/hooks/usePager', () => ({
  usePager: () => runnerMocks.pagerStore,
}))

vi.mock('@/pages/zhipin/shared/jobMapping', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/pages/zhipin/shared/jobMapping')>()
  return {
    ...actual,
    resetJobStatuses: runnerMocks.resetJobStatuses,
  }
})

async function loadBatchRunner() {
  return import('@/pages/zhipin/hooks/useAgentBatchRunner')
}

async function flushBatch() {
  await Promise.resolve()
  await Promise.resolve()
  if (runnerMocks.agentRuntimeStore.batchPromise) {
    await runnerMocks.agentRuntimeStore.batchPromise
  }
  await Promise.resolve()
}

describe('useAgentBatchRunner', () => {
  beforeEach(() => {
    setupPinia()
    runnerMocks.elMessageInfo.mockReset()
    runnerMocks.commonStore.deliverLock = false
    runnerMocks.commonStore.deliverStop = false
    runnerMocks.commonStore.deliverState = 'idle'
    runnerMocks.commonStore.deliverStatusMessage = '未开始'
    runnerMocks.statisticsStore.updateStatistics.mockReset()
    runnerMocks.statisticsStore.updateStatistics.mockResolvedValue(undefined)
    runnerMocks.agentRuntimeStore.batchPromise = null
    runnerMocks.agentRuntimeStore.activeTargetJobIds = []
    runnerMocks.agentRuntimeStore.remainingTargetJobIds = []
    runnerMocks.agentRuntimeStore.stopRequestedByCommand = false
    runnerMocks.agentRuntimeStore.setBatchPromise.mockClear()
    runnerMocks.agentRuntimeStore.setTargetJobIds.mockClear()
    runnerMocks.agentRuntimeStore.clearTargetJobState.mockClear()
    runnerMocks.agentRuntimeStore.consumeSeenJobIds.mockClear()
    runnerMocks.agentRuntimeStore.setStopRequestedByCommand.mockClear()
    runnerMocks.pagerStore.next.mockReset()
    runnerMocks.pagerStore.next.mockReturnValue(true)
    runnerMocks.deliverStore.jobListHandle.mockReset()
    runnerMocks.deliverStore.jobListHandle.mockResolvedValue({ seenJobIds: [] })
    runnerMocks.delay.mockReset()
    runnerMocks.delay.mockResolvedValue(undefined)
    runnerMocks.notification.mockReset()
    runnerMocks.notification.mockResolvedValue(undefined)
    runnerMocks.logger.debug.mockReset()
    runnerMocks.logger.error.mockReset()
    runnerMocks.abortAllPendingAIFilterReviews.mockReset()
    runnerMocks.executeAgentBatchLoop.mockReset()
    runnerMocks.executeAgentBatchLoop.mockResolvedValue({ stepMsg: 'loop completed' })
    runnerMocks.applyAgentBatchStartPayload.mockReset()
    runnerMocks.applyAgentBatchStartPayload.mockImplementation(async ({ agentRuntime, payload }) => {
      agentRuntime.setTargetJobIds(payload?.jobIds ?? [])
    })
    runnerMocks.useAgentBatchEvents.mockClear()
    for (const fn of Object.values(runnerMocks.batchEvents)) {
      fn.mockClear()
    }
    runnerMocks.resetJobStatuses.mockReset()
    runnerMocks.jobList.list = []
  })

  it('covers start, pause, resume, stop, stats, and resetFilter branches', async () => {
    const ensureStoresLoaded = vi.fn(async () => undefined)
    const ensureSupportedPage = vi.fn(() => true)
    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({ ensureStoresLoaded, ensureSupportedPage })

    runnerMocks.executeAgentBatchLoop.mockImplementation(async (options?: { shouldStop: () => boolean }) => {
      const shouldStop = options?.shouldStop ?? (() => false)
      while (!shouldStop()) {
        await Promise.resolve()
      }
      return { stepMsg: 'loop completed' }
    })

    const started = await runner.startBatch({ jobIds: ['job-1', 'job-2'], resetFiltered: true })
    expect(started).toEqual(expect.objectContaining({ ok: true, code: 'started' }))
    expect(runnerMocks.applyAgentBatchStartPayload).toHaveBeenCalled()
    expect(runnerMocks.agentRuntimeStore.setTargetJobIds).toHaveBeenCalledWith(['job-1', 'job-2'])

    const pausing = await runner.pauseBatch()
    expect(pausing).toEqual(expect.objectContaining({ ok: true, code: 'pause-requested' }))
    expect(runnerMocks.commonStore.deliverStop).toBe(true)
    expect(runnerMocks.batchEvents.emitBatchPausing).toHaveBeenCalledWith('正在暂停，等待当前岗位处理完成')

    await flushBatch()
    expect(runnerMocks.batchEvents.emitBatchPaused).toHaveBeenCalledWith('loop completed')

    runnerMocks.commonStore.deliverStop = false
    runnerMocks.executeAgentBatchLoop.mockResolvedValue({ stepMsg: 'loop completed' })

    const resumed = await runner.resumeBatch()
    expect(resumed).toEqual(expect.objectContaining({ ok: true, code: 'resumed' }))

    await flushBatch()
    expect(runnerMocks.batchEvents.emitBatchCompleted).toHaveBeenCalledWith('loop completed')

    const stats = await runner.stats()
    expect(stats).toEqual(expect.objectContaining({ ok: true, code: 'stats' }))
    expect(runnerMocks.statisticsStore.updateStatistics).toHaveBeenCalled()

    runnerMocks.jobList.list = [
      { status: { status: 'error' } },
      { status: { status: 'success' } },
    ]
    runner.resetFilter()
    expect(runnerMocks.resetJobStatuses).toHaveBeenCalledTimes(1)

    const predicate = runnerMocks.resetJobStatuses.mock.calls[0][1]
    expect(predicate({ status: { status: 'error' } })).toBe(true)
    expect(predicate({ status: { status: 'success' } })).toBe(false)

    const stopped = await runner.stopBatch()
    expect(stopped).toEqual(expect.objectContaining({ ok: true, code: 'stopped' }))
  })

  it('returns already-running, already-paused, and not-paused responses', async () => {
    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({
      ensureStoresLoaded: vi.fn(async () => undefined),
      ensureSupportedPage: () => true,
    })

    runnerMocks.commonStore.deliverLock = true
    await expect(runner.startBatch()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'already-running' }))

    runnerMocks.commonStore.deliverLock = false
    runnerMocks.commonStore.deliverState = 'paused'
    await expect(runner.pauseBatch()).resolves.toEqual(expect.objectContaining({ ok: true, code: 'already-paused' }))

    runnerMocks.commonStore.deliverState = 'idle'
    await expect(runner.resumeBatch()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'not-paused' }))
  })

  it('distinguishes stop finalization from pause finalization', async () => {
    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({
      ensureStoresLoaded: vi.fn(async () => undefined),
      ensureSupportedPage: () => true,
    })

    runnerMocks.executeAgentBatchLoop.mockImplementation(async (options?: { shouldStop: () => boolean }) => {
      const shouldStop = options?.shouldStop ?? (() => false)
      while (!shouldStop()) {
        await Promise.resolve()
      }
      return { stepMsg: 'stopped by command' }
    })

    await runner.startBatch({ jobIds: ['job-7'] })
    const stopPromise = runner.stopBatch()
    await flushBatch()

    await expect(stopPromise).resolves.toEqual(expect.objectContaining({ ok: true, code: 'stopped' }))
    expect(runnerMocks.abortAllPendingAIFilterReviews).toHaveBeenCalledWith('任务已停止')
    expect(runnerMocks.batchEvents.emitBatchStopped).toHaveBeenCalledTimes(1)
    expect(runnerMocks.batchEvents.emitBatchPaused).not.toHaveBeenCalled()
    expect(runnerMocks.commonStore.deliverState).toBe('idle')
  })

  it('fails commands on unsupported pages', async () => {
    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({
      ensureStoresLoaded: vi.fn(async () => undefined),
      ensureSupportedPage: () => false,
    })

    await expect(runner.startBatch()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'unsupported-page' }))
    await expect(runner.pauseBatch()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'unsupported-page' }))
    await expect(runner.resumeBatch()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'unsupported-page' }))
    await expect(runner.stopBatch()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'unsupported-page' }))
    await expect(runner.stats()).resolves.toEqual(expect.objectContaining({ ok: false, code: 'unsupported-page' }))
  })

  it('guards concurrent start requests before async setup finishes', async () => {
    let releaseEnsureStoresLoaded!: () => void
    const ensureStoresLoaded = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseEnsureStoresLoaded = resolve
        }),
    )
    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({
      ensureStoresLoaded,
      ensureSupportedPage: () => true,
    })

    const firstStart = runner.startBatch({ jobIds: ['job-1'] })
    const secondStart = runner.startBatch({ jobIds: ['job-2'] })

    await Promise.resolve()

    await expect(secondStart).resolves.toEqual(expect.objectContaining({ ok: false, code: 'already-running' }))
    expect(runnerMocks.applyAgentBatchStartPayload).not.toHaveBeenCalled()

    releaseEnsureStoresLoaded()

    await expect(firstStart).resolves.toEqual(expect.objectContaining({ ok: true, code: 'started' }))
  })
})
