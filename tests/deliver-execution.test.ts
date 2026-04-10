// @vitest-environment jsdom

import { ElMessage } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { delayMock, notificationMock } = vi.hoisted(() => ({
  delayMock: vi.fn(async () => {}),
  notificationMock: vi.fn(async () => {}),
}))

vi.mock('@/utils', () => ({
  delay: delayMock,
  getCurDay: vi.fn(() => '2026-04-10'),
  notification: notificationMock,
}))

import {
  type DeliverExecutionDependencies,
  finalizeDeliverIteration,
  handleDeliverFailure,
} from '@/pages/zhipin/services/deliverExecution'
import { RateLimitError } from '@/types/deliverError'

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
