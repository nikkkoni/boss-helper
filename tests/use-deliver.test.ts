// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createJob } from './helpers/jobs'
import { setupPinia } from './helpers/pinia'

const deliverMocks = vi.hoisted(() => ({
  agentRuntime: {
    registerFailureGuardrail: vi.fn(() => null),
  },
  cachePipelineResult: vi.fn(async () => undefined),
  common: {
    deliverState: 'running',
    deliverStop: false,
  },
  conf: {
    formData: {
      notification: {
        value: true,
      },
    },
  },
  createBossHelperAgentEvent: vi.fn((payload) => payload),
  createHandle: vi.fn(async () => ({ after: [], before: [] })),
  createHandleResult: vi.fn((candidateCount: number, seenJobIds: string[]) => ({
    candidateCount,
    seenJobIds,
  })),
  emitBossHelperAgentEvent: vi.fn(),
  executeDeliverJob: vi.fn(async () => ({ extraDelaySeconds: 0, stopResult: null })),
  finalizeDeliverIteration: vi.fn(async () => undefined),
  jobList: {
    list: [] as Array<any>,
  },
  log: {
    info: vi.fn(),
  },
  logger: {
    error: vi.fn(),
  },
  notification: vi.fn(async () => undefined),
  resetJobStatuses: vi.fn(),
  statistics: {
    todayData: {
      date: '2026-04-10',
      success: 0,
      total: 0,
    },
  },
  toAgentCurrentJob: vi.fn((job: Record<string, unknown>) => job),
}))

vi.mock('@/composables/useApplying', () => ({
  cachePipelineResult: deliverMocks.cachePipelineResult,
  createHandle: deliverMocks.createHandle,
}))

vi.mock('@/stores/common', () => ({
  useCommon: () => deliverMocks.common,
}))

vi.mock('@/stores/agent', () => ({
  useAgentRuntime: () => deliverMocks.agentRuntime,
}))

vi.mock('@/stores/statistics', () => ({
  useStatistics: () => deliverMocks.statistics,
}))

vi.mock('@/stores/conf', () => ({
  useConf: () => deliverMocks.conf,
}))

vi.mock('@/stores/jobs', () => ({
  jobList: deliverMocks.jobList,
}))

vi.mock('@/stores/log', () => ({
  useLog: () => deliverMocks.log,
}))

vi.mock('@/utils', () => ({
  notification: deliverMocks.notification,
}))

vi.mock('@/utils/logger', () => ({
  logger: deliverMocks.logger,
}))

vi.mock('@/pages/zhipin/hooks/agentEvents', () => ({
  createBossHelperAgentEvent: deliverMocks.createBossHelperAgentEvent,
  emitBossHelperAgentEvent: deliverMocks.emitBossHelperAgentEvent,
}))

vi.mock('@/pages/zhipin/services/deliverExecution', () => ({
  createHandleResult: deliverMocks.createHandleResult,
  executeDeliverJob: deliverMocks.executeDeliverJob,
  finalizeDeliverIteration: deliverMocks.finalizeDeliverIteration,
}))

vi.mock('@/pages/zhipin/shared/jobMapping', () => ({
  resetJobStatuses: deliverMocks.resetJobStatuses,
  toAgentCurrentJob: deliverMocks.toAgentCurrentJob,
}))

describe('useDeliver', () => {
  beforeEach(() => {
    setupPinia()
    deliverMocks.cachePipelineResult.mockReset()
    deliverMocks.agentRuntime.registerFailureGuardrail.mockReset()
    deliverMocks.agentRuntime.registerFailureGuardrail.mockReturnValue(null)
    deliverMocks.createBossHelperAgentEvent.mockClear()
    deliverMocks.createHandle.mockReset()
    deliverMocks.createHandle.mockResolvedValue({ after: [], before: [] })
    deliverMocks.createHandleResult.mockReset()
    deliverMocks.createHandleResult.mockImplementation(
      (candidateCount: number, seenJobIds: string[]) => ({
        candidateCount,
        seenJobIds,
      }),
    )
    deliverMocks.emitBossHelperAgentEvent.mockReset()
    deliverMocks.executeDeliverJob.mockReset()
    deliverMocks.executeDeliverJob.mockResolvedValue({ extraDelaySeconds: 0, stopResult: null })
    deliverMocks.finalizeDeliverIteration.mockReset()
    deliverMocks.finalizeDeliverIteration.mockResolvedValue(undefined)
    deliverMocks.jobList.list = []
    deliverMocks.log.info.mockReset()
    deliverMocks.logger.error.mockReset()
    deliverMocks.notification.mockReset()
    deliverMocks.resetJobStatuses.mockReset()
    deliverMocks.toAgentCurrentJob.mockReset()
    deliverMocks.toAgentCurrentJob.mockImplementation((job: Record<string, unknown>) => job)
    deliverMocks.common.deliverState = 'running'
    deliverMocks.common.deliverStop = false
    deliverMocks.conf.formData.notification.value = true
  })

  it('handles selected job subsets, stop requests, and non-wait statuses', async () => {
    const { useDeliver } = await import('@/pages/zhipin/hooks/useDeliver')
    const waitJob = createJob({
      encryptJobId: 'job-wait',
      status: {
        msg: '等待中',
        setStatus(status, msg = '') {
          waitJob.status.status = status
          waitJob.status.msg = msg
        },
        status: 'wait',
      },
    })
    const successJob = createJob({
      encryptJobId: 'job-success',
      status: {
        msg: '成功',
        setStatus(status, msg = '') {
          successJob.status.status = status
          successJob.status.msg = msg
        },
        status: 'success',
      },
    })
    deliverMocks.jobList.list = [waitJob, successJob]

    const store = useDeliver()
    const result = await store.jobListHandle({
      resetSelectionStatuses: true,
      selectedJobIds: ['job-wait'],
    })

    expect(result).toEqual({
      candidateCount: 1,
      seenJobIds: ['job-wait'],
    })
    expect(store.total).toBe(1)
    expect(store.current).toBe(0)
    expect(store.currentData).toStrictEqual(waitJob)
    expect(deliverMocks.log.info).toHaveBeenCalledWith(
      '获取岗位',
      '本次获取到 2 个，命中定向岗位 1 个',
    )
    expect(deliverMocks.resetJobStatuses).toHaveBeenCalledWith(
      deliverMocks.jobList.list,
      expect.any(Function),
    )
    const predicate = deliverMocks.resetJobStatuses.mock.calls[0][1]
    expect(predicate(waitJob)).toBe(true)
    expect(predicate(successJob)).toBe(false)
    expect(deliverMocks.executeDeliverJob).toHaveBeenCalledTimes(1)
    expect(deliverMocks.finalizeDeliverIteration).toHaveBeenCalledTimes(1)

    deliverMocks.common.deliverStop = true
    deliverMocks.executeDeliverJob.mockClear()
    deliverMocks.finalizeDeliverIteration.mockClear()

    const stopped = await store.jobListHandle()
    expect(stopped).toEqual({
      candidateCount: 2,
      seenJobIds: [],
    })
    expect(deliverMocks.log.info).toHaveBeenCalledWith('暂停投递', '剩余 2 个未处理')
    expect(deliverMocks.executeDeliverJob).not.toHaveBeenCalled()
    expect(deliverMocks.finalizeDeliverIteration).not.toHaveBeenCalled()
  })

  it('reports unexpected execution errors and still finalizes the iteration', async () => {
    const { ElMessage } = await import('element-plus')
    const { useDeliver } = await import('@/pages/zhipin/hooks/useDeliver')
    const waitJob = createJob({
      encryptJobId: 'job-error',
      jobName: 'Broken Job',
      status: {
        msg: '等待中',
        setStatus(status, msg = '') {
          waitJob.status.status = status
          waitJob.status.msg = msg
        },
        status: 'wait',
      },
    })
    deliverMocks.jobList.list = [waitJob]
    deliverMocks.executeDeliverJob.mockRejectedValueOnce(new Error('unexpected crash'))

    const store = useDeliver()
    const result = await store.jobListHandle()

    expect(result).toEqual({
      candidateCount: 1,
      seenJobIds: ['job-error'],
    })
    expect(waitJob.status.status).toBe('error')
    expect(waitJob.status.msg).toBe('未知报错')
    expect(deliverMocks.notification).toHaveBeenCalledWith('未知报错')
    expect(ElMessage.error).toHaveBeenCalledWith('未知报错')
    expect(deliverMocks.emitBossHelperAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          errorMessage: 'unexpected crash',
        },
        message: '未知报错: unexpected crash',
        type: 'job-failed',
      }),
    )
    expect(deliverMocks.finalizeDeliverIteration).toHaveBeenCalledWith(
      expect.objectContaining({
        cachePipelineResultFn: deliverMocks.cachePipelineResult,
        conf: deliverMocks.conf,
        data: waitJob,
        statistics: deliverMocks.statistics,
      }),
    )
    expect(deliverMocks.logger.error).toHaveBeenCalledWith('未知报错', expect.any(Error), waitJob)
  })

  it('emits a structured limit event when unexpected crashes hit the failure guardrail', async () => {
    const { useDeliver } = await import('@/pages/zhipin/hooks/useDeliver')
    const waitJob = createJob({
      encryptJobId: 'job-guardrail',
      jobName: 'Broken Job',
      status: {
        msg: '等待中',
        setStatus(status, msg = '') {
          waitJob.status.status = status
          waitJob.status.msg = msg
        },
        status: 'wait',
      },
    })
    deliverMocks.jobList.list = [waitJob]
    deliverMocks.executeDeliverJob.mockRejectedValueOnce(new Error('unexpected crash'))
    ;(deliverMocks.agentRuntime.registerFailureGuardrail as any).mockReturnValueOnce({
      code: 'consecutive-failure-auto-stop',
      consecutiveFailures: 3,
      limit: 3,
      message: '连续失败达到 3 次，已自动暂停投递，请先检查最近错误后再决定是否 resume。',
      source: 'consecutive-failure-limit',
      totalFailures: 3,
    })

    const store = useDeliver()
    await store.jobListHandle()

    expect(deliverMocks.emitBossHelperAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          consecutiveFailures: 3,
          guardrailCode: 'consecutive-failure-auto-stop',
          source: 'consecutive-failure-limit',
        }),
        message: '连续失败达到 3 次，已自动暂停投递，请先检查最近错误后再决定是否 resume。',
        type: 'limit-reached',
      }),
    )
    expect(deliverMocks.common.deliverStop).toBe(true)
  })
})
