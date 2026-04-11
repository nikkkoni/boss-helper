// @vitest-environment jsdom

import { ElMessage } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { delayMock, notificationMock } = vi.hoisted(() => ({
  delayMock: vi.fn(async () => {}),
  notificationMock: vi.fn(async () => {}),
}))

const applyToJobMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/utils', () => ({
  delay: delayMock,
  getCurDay: vi.fn(() => '2026-04-10'),
  notification: notificationMock,
}))

vi.mock('@/site-adapters', () => ({
  getActiveSiteAdapter: vi.fn(() => ({
    applyToJob: applyToJobMock,
  })),
}))

import {
  type DeliverExecutionDependencies,
  executeDeliverJob,
  finalizeDeliverIteration,
  handleDeliverSuccess,
  handleDeliverFailure,
  normalizeDeliverError,
} from '@/pages/zhipin/services/deliverExecution'
import {
  BossHelperError,
  LimitError,
  RateLimitError,
} from '@/types/deliverError'

import { createJob, createLogContext } from './helpers/jobs'

function createDeps(): DeliverExecutionDependencies {
  return {
    cachePipelineResultFn: vi.fn(async () => undefined),
    common: {
      deliverState: 'running',
      deliverStop: false,
    },
    conf: {
      formData: {
        delay: {
          deliveryInterval: 5,
        },
        deliveryLimit: {
          value: 120,
        },
        notification: {
          value: true,
        },
      },
    },
    counters: {
      current: 0,
    },
    log: {
      add: vi.fn(),
    },
    statistics: {
      todayData: {
        date: '2026-04-10',
        success: 0,
        total: 0,
      },
      updateStatistics: vi.fn(async () => undefined),
    },
  }
}

describe('deliverExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes unknown errors into BossHelperError instances', () => {
    const unknown = normalizeDeliverError('boom')
    const known = new BossHelperError('known', 'danger')

    expect(normalizeDeliverError(known)).toBe(known)
    expect(unknown).toMatchObject({
      message: '预期外:boom',
      name: '未知错误',
      state: 'danger',
    })
  })

  it('marks successful deliveries, enforces limits, and rolls over statistics on date changes', async () => {
    const deps = createDeps()
    const data = createJob({ encryptJobId: 'job-success', jobName: 'Frontend' })
    const ctx = createLogContext(data, { message: '你好' })
    const result = {
      candidateCount: 3,
      seenJobIds: [data.encryptJobId],
    }

    deps.statistics.todayData.success = 119

    await expect(handleDeliverSuccess({ data, ctx, deps, result })).resolves.toEqual({
      stopResult: result,
    })
    expect(deps.common.deliverStop).toBe(true)
    expect(data.status.status).toBe('success')
    expect(notificationMock).toHaveBeenCalledWith('投递到达上限 120，已暂停投递')
    expect(ElMessage.info).toHaveBeenCalledWith('投递到达上限 120，已暂停投递')

    vi.clearAllMocks()
    deps.common.deliverStop = false
    deps.statistics.todayData.success = 1
    deps.statistics.todayData.date = '2026-04-09'

    await expect(handleDeliverSuccess({ data, ctx, deps, result })).resolves.toEqual({
      stopResult: null,
    })
    expect(deps.statistics.updateStatistics).toHaveBeenCalledTimes(1)
    expect(deps.log.add).toHaveBeenCalledTimes(1)
  })

  it('stops on boss limits and keeps non-limit failures non-blocking', async () => {
    const deps = createDeps()
    const data = createJob({ encryptJobId: 'job-limit' })
    const result = {
      candidateCount: 2,
      seenJobIds: [data.encryptJobId],
    }

    await expect(
      handleDeliverFailure({
        data,
        error: new LimitError('今日上限'),
        ctx: createLogContext(data),
        deps,
        result,
      }),
    ).resolves.toEqual({
      stopResult: result,
    })
    expect(deps.common.deliverStop).toBe(true)
    expect(notificationMock).toHaveBeenCalledWith('投递到达boss上限 今日上限，已暂停投递')
    expect(ElMessage.error).toHaveBeenCalledWith('投递到达boss上限 今日上限，已暂停投递')

    vi.clearAllMocks()
    deps.common.deliverStop = false

    await expect(
      handleDeliverFailure({
        data,
        error: new Error('network boom'),
        ctx: createLogContext(data),
        deps,
        result,
      }),
    ).resolves.toEqual({
      stopResult: null,
    })
    expect(data.status.status).toBe('error')
    expect(deps.common.deliverStop).toBe(false)
  })

  it('runs before/apply/after hooks and reports apply errors as failures', async () => {
    const deps = createDeps()
    const data = createJob({ encryptJobId: 'job-run' })
    const before = vi.fn(async (_payload, ctx) => {
      ctx.message = 'before'
    })
    const after = vi.fn(async (_payload, ctx) => {
      ctx.state = 'after'
    })
    const chandle = {
      before: [before],
      after: [after],
    }

    await expect(
      executeDeliverJob({
        cacheResult: {
          candidateCount: 1,
          seenJobIds: [data.encryptJobId],
        },
        chandle: chandle as never,
        data,
        deps,
      }),
    ).resolves.toEqual({
      stopResult: null,
    })
    expect(before).toHaveBeenCalledTimes(1)
    expect(after).toHaveBeenCalledTimes(1)
    expect(applyToJobMock).toHaveBeenCalledWith(data)

    vi.clearAllMocks()
    applyToJobMock.mockRejectedValueOnce(new Error('apply failed'))

    await expect(
      executeDeliverJob({
        cacheResult: {
          candidateCount: 1,
          seenJobIds: [data.encryptJobId],
        },
        chandle: chandle as never,
        data,
        deps,
      }),
    ).resolves.toEqual({
      stopResult: null,
    })
    expect(data.status.status).toBe('error')
    expect(deps.log.add).toHaveBeenCalledTimes(1)
  })

  it('continues finalization even when cache persistence fails', async () => {
    const deps = createDeps()
    const data = createJob({ encryptJobId: 'job-cache' })

    await finalizeDeliverIteration({
      cachePipelineResultFn: vi.fn(async () => {
        throw new Error('cache failed')
      }),
      conf: deps.conf,
      data,
      statistics: deps.statistics,
    })

    expect(delayMock).toHaveBeenLastCalledWith(5)
    expect(deps.statistics.todayData.total).toBe(1)
  })

  it('applies rate-limit backoff to the current iteration without mutating deliveryInterval', async () => {
    const deps = createDeps()
    const data = createJob()
    const result = await handleDeliverFailure({
      data,
      error: new RateLimitError('频率限制'),
      ctx: createLogContext(data),
      deps,
      result: {
        candidateCount: 1,
        seenJobIds: [data.encryptJobId],
      },
    })

    expect(result).toEqual({
      extraDelaySeconds: 3,
      stopResult: null,
    })
    expect(deps.conf.formData.delay.deliveryInterval).toBe(5)
    expect(notificationMock).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).toHaveBeenCalledTimes(1)
    expect(delayMock).toHaveBeenCalledWith(30)

    await finalizeDeliverIteration({
      cachePipelineResultFn: deps.cachePipelineResultFn,
      conf: deps.conf,
      data,
      extraDelaySeconds: result.extraDelaySeconds,
      statistics: deps.statistics,
    })

    expect(delayMock).toHaveBeenLastCalledWith(8)
    expect(deps.statistics.todayData.total).toBe(1)
  })
})
