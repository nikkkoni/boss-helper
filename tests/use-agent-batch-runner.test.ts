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
    clearFailureGuardrailState: vi.fn(),
    currentRun: null as Record<string, unknown> | null,
    activeTargetJobIds: [] as string[],
    ensureRunSummaryLoaded: vi.fn(async () => undefined),
    getFailureGuardrailSnapshot: vi.fn(() => ({
      consecutiveFailures: 0,
      limit: 3,
      triggered: null,
    })),
    getRunSummarySnapshot: vi.fn(() => ({
      current: runnerMocks.agentRuntimeStore.currentRun,
      recent: runnerMocks.agentRuntimeStore.recentRun,
    })),
    remainingTargetJobIds: [] as string[],
    recentRun: null as Record<string, unknown> | null,
    recordEvent: vi.fn(async () => undefined),
    registerFailureGuardrail: vi.fn(() => null),
    stopRequestedByCommand: false,
    updateRunProgress: vi.fn(async () => undefined),
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
      runnerMocks.agentRuntimeStore.remainingTargetJobIds =
        runnerMocks.agentRuntimeStore.remainingTargetJobIds.filter((jobId) => !seen.has(jobId))
      return runnerMocks.agentRuntimeStore.remainingTargetJobIds.length
    }),
    setStopRequestedByCommand: vi.fn((value: boolean) => {
      runnerMocks.agentRuntimeStore.stopRequestedByCommand = value
    }),
  },
  confStore: {
    formData: {
      aiFiltering: {
        enable: false,
        externalMode: false,
      },
      aiGreeting: {
        enable: false,
      },
      aiReply: {
        enable: false,
      },
      customGreeting: {
        enable: false,
      },
      delay: {
        deliveryPageNext: 1,
        deliveryStarts: 1,
      },
      deliveryLimit: {
        value: 120,
      },
      friendStatus: {
        value: true,
      },
      notification: {
        value: true,
      },
      sameCompanyFilter: {
        value: true,
      },
      sameHrFilter: {
        value: true,
      },
      useCache: {
        value: true,
      },
    },
  },
  logStore: {
    data: [] as Array<{ createdAt: string; message: string; state_name: string }>,
  },
  pagerStore: {
    next: vi.fn(() => true),
    page: { page: 1, pageSize: 15 },
  },
  deliverStore: {
    jobListHandle: vi.fn(async () => ({ seenJobIds: [] })),
    currentData: null as any,
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
  executeAgentBatchLoop: vi.fn(async (_options?: { shouldStop: () => boolean }) => ({
    stepMsg: 'loop completed',
  })),
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

vi.mock('@/stores/common', () => ({
  useCommon: () => runnerMocks.commonStore,
}))

vi.mock('@/stores/statistics', () => ({
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
    runnerMocks.statisticsStore.todayData.date = '2026-04-10'
    runnerMocks.statisticsStore.todayData.success = 0
    runnerMocks.statisticsStore.todayData.total = 0
    runnerMocks.statisticsStore.updateStatistics.mockReset()
    runnerMocks.statisticsStore.updateStatistics.mockResolvedValue(undefined)
    runnerMocks.agentRuntimeStore.batchPromise = null
    runnerMocks.agentRuntimeStore.currentRun = null
    runnerMocks.agentRuntimeStore.activeTargetJobIds = []
    runnerMocks.agentRuntimeStore.remainingTargetJobIds = []
    runnerMocks.agentRuntimeStore.recentRun = null
    runnerMocks.agentRuntimeStore.stopRequestedByCommand = false
    runnerMocks.agentRuntimeStore.clearFailureGuardrailState.mockClear()
    runnerMocks.agentRuntimeStore.ensureRunSummaryLoaded.mockClear()
    runnerMocks.agentRuntimeStore.getFailureGuardrailSnapshot.mockClear()
    runnerMocks.agentRuntimeStore.getRunSummarySnapshot.mockClear()
    runnerMocks.agentRuntimeStore.setBatchPromise.mockClear()
    runnerMocks.agentRuntimeStore.setTargetJobIds.mockClear()
    runnerMocks.agentRuntimeStore.clearTargetJobState.mockClear()
    runnerMocks.agentRuntimeStore.consumeSeenJobIds.mockClear()
    runnerMocks.agentRuntimeStore.recordEvent.mockClear()
    runnerMocks.agentRuntimeStore.registerFailureGuardrail.mockClear()
    runnerMocks.agentRuntimeStore.setStopRequestedByCommand.mockClear()
    runnerMocks.agentRuntimeStore.updateRunProgress.mockClear()
    runnerMocks.confStore.formData.deliveryLimit.value = 120
    runnerMocks.pagerStore.next.mockReset()
    runnerMocks.pagerStore.next.mockReturnValue(true)
    runnerMocks.deliverStore.jobListHandle.mockReset()
    runnerMocks.deliverStore.jobListHandle.mockResolvedValue({ seenJobIds: [] })
    runnerMocks.deliverStore.currentData = null
    runnerMocks.deliverStore.current = 0
    runnerMocks.deliverStore.total = 0
    runnerMocks.delay.mockReset()
    runnerMocks.delay.mockResolvedValue(undefined)
    runnerMocks.notification.mockReset()
    runnerMocks.notification.mockResolvedValue(undefined)
    runnerMocks.logger.debug.mockReset()
    runnerMocks.logger.error.mockReset()
    runnerMocks.logStore.data = []
    runnerMocks.abortAllPendingAIFilterReviews.mockReset()
    runnerMocks.executeAgentBatchLoop.mockReset()
    runnerMocks.executeAgentBatchLoop.mockResolvedValue({ stepMsg: 'loop completed' })
    runnerMocks.applyAgentBatchStartPayload.mockReset()
    runnerMocks.applyAgentBatchStartPayload.mockImplementation(
      async ({ agentRuntime, payload }) => {
        agentRuntime.setTargetJobIds(payload?.jobIds ?? [])
      },
    )
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

    runnerMocks.executeAgentBatchLoop.mockImplementation(
      async (options?: { shouldStop: () => boolean }) => {
        const shouldStop = options?.shouldStop ?? (() => false)
        while (!shouldStop()) {
          await Promise.resolve()
        }
        return { stepMsg: 'loop completed' }
      },
    )

    const started = await runner.startBatch({ jobIds: ['job-1', 'job-2'], resetFiltered: true })
    expect(started).toEqual(expect.objectContaining({ ok: true, code: 'started' }))
    expect(runnerMocks.applyAgentBatchStartPayload).toHaveBeenCalled()
    expect(runnerMocks.agentRuntimeStore.setTargetJobIds).toHaveBeenCalledWith(['job-1', 'job-2'])
    expect(runnerMocks.agentRuntimeStore.clearFailureGuardrailState).toHaveBeenCalledWith({
      clearTrigger: true,
      resetTotalFailures: true,
    })

    const pausing = await runner.pauseBatch()
    expect(pausing).toEqual(expect.objectContaining({ ok: true, code: 'pause-requested' }))
    expect(runnerMocks.commonStore.deliverStop).toBe(true)
    expect(runnerMocks.batchEvents.emitBatchPausing).toHaveBeenCalledWith(
      '正在暂停，等待当前岗位处理完成',
    )

    await flushBatch()
    expect(runnerMocks.batchEvents.emitBatchPaused).toHaveBeenCalledWith('loop completed')

    runnerMocks.commonStore.deliverStop = false
    runnerMocks.executeAgentBatchLoop.mockResolvedValue({ stepMsg: 'loop completed' })

    const resumed = await runner.resumeBatch()
    expect(resumed).toEqual(expect.objectContaining({ ok: true, code: 'resumed' }))
    expect(runnerMocks.agentRuntimeStore.clearFailureGuardrailState).toHaveBeenCalledWith({
      clearTrigger: true,
      resetTotalFailures: false,
    })

    await flushBatch()
    expect(runnerMocks.batchEvents.emitBatchCompleted).toHaveBeenCalledWith('loop completed')

    const stats = await runner.stats()
    expect(stats).toEqual(
      expect.objectContaining({
        ok: true,
        code: 'stats',
        data: expect.objectContaining({
          risk: expect.objectContaining({
            level: 'high',
            delivery: expect.objectContaining({
              limit: 120,
              remainingToday: 120,
              usedToday: 0,
            }),
            observed: expect.objectContaining({
              sessionDuplicates: {
                communicated: 0,
                other: 0,
                sameCompany: 0,
                sameHr: 0,
              },
            }),
          }),
        }),
      }),
    )
    expect(runnerMocks.statisticsStore.updateStatistics).toHaveBeenCalled()

    runnerMocks.jobList.list = [{ status: { status: 'error' } }, { status: { status: 'success' } }]
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
    await expect(runner.startBatch()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'already-running',
        retryable: false,
        suggestedAction: 'continue',
      }),
    )

    runnerMocks.commonStore.deliverLock = false
    await expect(runner.pauseBatch()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'not-running',
        retryable: false,
        suggestedAction: 'continue',
      }),
    )

    runnerMocks.commonStore.deliverState = 'paused'
    await expect(runner.startBatch()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'paused',
        retryable: false,
        suggestedAction: 'resume',
      }),
    )
    await expect(runner.pauseBatch()).resolves.toEqual(
      expect.objectContaining({ ok: true, code: 'already-paused' }),
    )

    runnerMocks.commonStore.deliverState = 'idle'
    await expect(runner.resumeBatch()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'not-paused',
        retryable: false,
        suggestedAction: 'continue',
      }),
    )
  })

  it('blocks resume when the current run already hit the per-run delivery guardrail', async () => {
    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({
      ensureStoresLoaded: vi.fn(async () => undefined),
      ensureSupportedPage: () => true,
    })

    runnerMocks.commonStore.deliverState = 'paused'
    runnerMocks.agentRuntimeStore.currentRun = {
      deliveredJobIds: Array.from({ length: 20 }, (_, index) => `job-${index + 1}`),
      runId: 'run-limit',
      state: 'paused',
    }

    await expect(runner.resumeBatch()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'run-delivery-limit-reached',
        retryable: false,
        suggestedAction: 'continue',
      }),
    )
    expect(runnerMocks.agentRuntimeStore.setBatchPromise).not.toHaveBeenCalled()
  })

  it('blocks start and resume when today deliveryLimit is already exhausted', async () => {
    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({
      ensureStoresLoaded: vi.fn(async () => undefined),
      ensureSupportedPage: () => true,
    })

    runnerMocks.statisticsStore.todayData.success = 120
    runnerMocks.confStore.formData.deliveryLimit.value = 120

    await expect(runner.startBatch({ jobIds: ['job-1'] })).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'delivery-limit-reached',
        retryable: false,
        suggestedAction: 'stop',
      }),
    )
    expect(runnerMocks.applyAgentBatchStartPayload).not.toHaveBeenCalled()
    expect(runnerMocks.agentRuntimeStore.setBatchPromise).not.toHaveBeenCalled()

    runnerMocks.commonStore.deliverState = 'paused'

    await expect(runner.resumeBatch()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'delivery-limit-reached',
        retryable: false,
        suggestedAction: 'stop',
      }),
    )
    expect(runnerMocks.agentRuntimeStore.setBatchPromise).not.toHaveBeenCalled()
  })

  it('allows start when configPatch raises deliveryLimit above current usage', async () => {
    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({
      ensureStoresLoaded: vi.fn(async () => undefined),
      ensureSupportedPage: () => true,
    })

    runnerMocks.statisticsStore.todayData.success = 120
    runnerMocks.confStore.formData.deliveryLimit.value = 120

    await expect(
      runner.startBatch({
        configPatch: {
          deliveryLimit: {
            value: 121,
          },
        },
        jobIds: ['job-2'],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        code: 'started',
      }),
    )
    expect(runnerMocks.applyAgentBatchStartPayload).toHaveBeenCalledTimes(1)
  })

  it('clears stale deliver progress before a fresh start run publishes state', async () => {
    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({
      ensureStoresLoaded: vi.fn(async () => undefined),
      ensureSupportedPage: () => true,
    })

    runnerMocks.deliverStore.currentData = {
      brandName: 'Old Company',
      encryptJobId: 'old-job',
      jobName: 'Old Role',
      status: {
        msg: '打招呼出错',
        status: 'error',
      },
    }
    runnerMocks.deliverStore.current = 4
    runnerMocks.deliverStore.total = 5

    runnerMocks.executeAgentBatchLoop.mockImplementation(async () => {
      expect(runnerMocks.deliverStore.currentData).toBeUndefined()
      expect(runnerMocks.deliverStore.current).toBe(0)
      expect(runnerMocks.deliverStore.total).toBe(0)
      return { stepMsg: 'loop completed' }
    })

    await expect(runner.startBatch({ jobIds: ['job-9'] })).resolves.toEqual(
      expect.objectContaining({ ok: true, code: 'started' }),
    )

    await flushBatch()
  })

  it('exposes current-session duplicate feedback through risk stats', async () => {
    runnerMocks.logStore.data = [
      {
        createdAt: '2026-04-10T09:00:00.000Z',
        message: '已经沟通过',
        state_name: '重复沟通',
      },
      {
        createdAt: '2026-04-10T09:01:00.000Z',
        message: '相同公司已投递',
        state_name: '重复沟通',
      },
      {
        createdAt: '2026-04-10T09:02:00.000Z',
        message: '相同hr已投递',
        state_name: '重复沟通',
      },
    ]

    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({
      ensureStoresLoaded: vi.fn(async () => undefined),
      ensureSupportedPage: () => true,
    })

    await expect(runner.stats()).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          risk: expect.objectContaining({
            observed: expect.objectContaining({
              sessionDuplicates: {
                communicated: 1,
                other: 0,
                sameCompany: 1,
                sameHr: 1,
              },
            }),
          }),
        }),
      }),
    )
  })

  it('distinguishes stop finalization from pause finalization', async () => {
    const { useAgentBatchRunner } = await loadBatchRunner()
    const runner = useAgentBatchRunner({
      ensureStoresLoaded: vi.fn(async () => undefined),
      ensureSupportedPage: () => true,
    })

    runnerMocks.executeAgentBatchLoop.mockImplementation(
      async (options?: { shouldStop: () => boolean }) => {
        const shouldStop = options?.shouldStop ?? (() => false)
        while (!shouldStop()) {
          await Promise.resolve()
        }
        return { stepMsg: 'stopped by command' }
      },
    )

    await runner.startBatch({ jobIds: ['job-7'] })
    const stopPromise = runner.stopBatch()
    await flushBatch()

    await expect(stopPromise).resolves.toEqual(
      expect.objectContaining({ ok: true, code: 'stopped' }),
    )
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

    await expect(runner.startBatch()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'unsupported-page',
        retryable: true,
        suggestedAction: 'navigate',
      }),
    )
    await expect(runner.pauseBatch()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'unsupported-page',
        retryable: true,
        suggestedAction: 'navigate',
      }),
    )
    await expect(runner.resumeBatch()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'unsupported-page',
        retryable: true,
        suggestedAction: 'navigate',
      }),
    )
    await expect(runner.stopBatch()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'unsupported-page',
        retryable: true,
        suggestedAction: 'navigate',
      }),
    )
    await expect(runner.stats()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        code: 'unsupported-page',
        retryable: true,
        suggestedAction: 'navigate',
      }),
    )
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

    await expect(secondStart).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'already-running' }),
    )
    expect(runnerMocks.applyAgentBatchStartPayload).not.toHaveBeenCalled()

    releaseEnsureStoresLoaded()

    await expect(firstStart).resolves.toEqual(
      expect.objectContaining({ ok: true, code: 'started' }),
    )
  })

})
