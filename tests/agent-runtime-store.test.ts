// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const runtimeStoreMocks = vi.hoisted(() => ({
  counter: {
    storageGet: vi.fn(async () => ({ current: null, recent: null })),
    storageSet: vi.fn(async () => true),
  },
  logger: {
    warn: vi.fn(),
  },
}))

vi.mock('@/message', () => ({
  counter: runtimeStoreMocks.counter,
}))

vi.mock('@/utils/logger', () => ({
  logger: runtimeStoreMocks.logger,
}))

import { useAgentRuntime } from '@/stores/agent'

describe('useAgentRuntime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    runtimeStoreMocks.counter.storageGet.mockClear()
    runtimeStoreMocks.counter.storageSet.mockClear()
    runtimeStoreMocks.logger.warn.mockClear()
    window.history.replaceState({}, '', '/web/geek/jobs?page=2')
  })

  it('tracks target job ids and removes seen jobs from remaining queue', () => {
    const store = useAgentRuntime()

    store.setTargetJobIds(['job-1', 'job-2', 'job-3'])

    expect(store.activeTargetJobIds).toEqual(['job-1', 'job-2', 'job-3'])
    expect(store.remainingTargetJobIds).toEqual(['job-1', 'job-2', 'job-3'])

    const remainingCount = store.consumeSeenJobIds(['job-2', 'job-4'])

    expect(remainingCount).toBe(2)
    expect(store.remainingTargetJobIds).toEqual(['job-1', 'job-3'])
    expect(store.activeTargetJobIds).toEqual(['job-1', 'job-2', 'job-3'])
  })

  it('tracks batch lifecycle flags and clears state', () => {
    const store = useAgentRuntime()
    const pendingBatch = Promise.resolve()

    expect(store.hasPendingBatch).toBe(false)

    store.setBatchPromise(pendingBatch)
    store.setStopRequestedByCommand(true)
    store.setTargetJobIds(['job-1'])

    expect(store.batchPromise).toBe(pendingBatch)
    expect(store.hasPendingBatch).toBe(true)
    expect(store.stopRequestedByCommand).toBe(true)

    store.clearTargetJobState()
    store.setBatchPromise(null)
    store.setStopRequestedByCommand(false)

    expect(store.activeTargetJobIds).toEqual([])
    expect(store.remainingTargetJobIds).toEqual([])
    expect(store.batchPromise).toBeNull()
    expect(store.hasPendingBatch).toBe(false)
    expect(store.stopRequestedByCommand).toBe(false)
  })

  it('tracks persisted run summaries across lifecycle events', async () => {
    const store = useAgentRuntime()

    await store.ensureRunSummaryLoaded()

    await store.recordEvent({
      createdAt: '2026-04-12T10:00:00.000Z',
      id: 'evt-start',
      message: '投递任务已启动',
      progress: {
        activeTargetJobIds: ['job-1', 'job-2'],
        current: 0,
        currentJob: null,
        locked: true,
        message: '投递任务已启动',
        page: 2,
        pageSize: 15,
        remainingTargetJobIds: ['job-1', 'job-2'],
        state: 'running',
        stopRequested: false,
        total: 2,
      },
      state: 'running',
      type: 'batch-started',
    })

    const runId = store.currentRun?.runId
    expect(runId).toEqual(expect.any(String))
    expect(store.currentRun).toEqual(
      expect.objectContaining({
        activeTargetJobIds: ['job-1', 'job-2'],
        remainingTargetJobIds: ['job-1', 'job-2'],
        state: 'running',
      }),
    )

    await store.recordEvent({
      createdAt: '2026-04-12T10:00:05.000Z',
      id: 'evt-job-started',
      job: {
        brandName: 'Acme',
        encryptJobId: 'job-1',
        jobName: 'Frontend Engineer',
        message: '处理中',
        status: 'running',
      },
      message: '开始处理岗位: Frontend Engineer',
      progress: {
        current: 1,
        total: 2,
      },
      state: 'running',
      type: 'job-started',
    })

    await store.recordEvent({
      createdAt: '2026-04-12T10:00:10.000Z',
      id: 'evt-paused',
      message: '等待当前岗位处理完成',
      state: 'paused',
      type: 'batch-paused',
    })

    expect(store.currentRun).toEqual(
      expect.objectContaining({
        analyzedJobIds: ['job-1'],
        recovery: expect.objectContaining({
          resumable: true,
          suggestedAction: 'resume',
        }),
        runId,
        state: 'paused',
      }),
    )

    await store.recordEvent({
      createdAt: '2026-04-12T10:00:20.000Z',
      id: 'evt-resumed',
      message: '投递已恢复',
      state: 'running',
      type: 'batch-resumed',
    })

    await store.recordEvent({
      createdAt: '2026-04-12T10:00:30.000Z',
      id: 'evt-success',
      job: {
        brandName: 'Acme',
        encryptJobId: 'job-1',
        jobName: 'Frontend Engineer',
        message: '投递成功',
        status: 'success',
      },
      message: '投递成功: Frontend Engineer',
      progress: {
        current: 1,
        total: 2,
      },
      state: 'running',
      type: 'job-succeeded',
    })

    await store.recordEvent({
      createdAt: '2026-04-12T10:00:40.000Z',
      id: 'evt-completed',
      message: '投递结束',
      state: 'completed',
      type: 'batch-completed',
    })

    expect(store.currentRun).toBeNull()
    expect(store.recentRun).toEqual(
      expect.objectContaining({
        finishedAt: '2026-04-12T10:00:40.000Z',
        processedJobIds: ['job-1'],
        recovery: expect.objectContaining({
          resumable: false,
          suggestedAction: 'continue',
        }),
        runId,
        state: 'completed',
      }),
    )
    expect(runtimeStoreMocks.counter.storageSet).toHaveBeenCalled()
  })
})