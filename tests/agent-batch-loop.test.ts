import { describe, expect, it, vi } from 'vitest'

import { executeAgentBatchLoop } from '@/pages/zhipin/hooks/agentBatchLoop'

describe('executeAgentBatchLoop', () => {
  it('stops when job list is empty', async () => {
    const result = await executeAgentBatchLoop({
      activeTargetJobIds: [],
      consumeSeenJobIds: vi.fn(),
      delayDeliveryPageNextMs: 0,
      delayDeliveryStartsMs: 0,
      getJobList: () => [],
      getLocationHref: () => 'https://www.zhipin.com/web/geek/jobs',
      getRemainingTargetJobIds: () => [],
      goNextPage: () => true,
      handleJobList: vi.fn(),
      logDebug: vi.fn(),
      resetSelectionStatuses: false,
      shouldStop: () => false,
      wait: async () => {},
    })

    expect(result.stepMsg).toBe('投递结束, job列表为空')
  })

  it('completes targeted delivery after consuming seen jobs', async () => {
    let remainingTargetJobIds = ['job-1', 'job-2']

    const result = await executeAgentBatchLoop({
      activeTargetJobIds: ['job-1', 'job-2'],
      consumeSeenJobIds: (seenJobIds) => {
        const seen = new Set(seenJobIds)
        remainingTargetJobIds = remainingTargetJobIds.filter((jobId) => !seen.has(jobId))
        return remainingTargetJobIds.length
      },
      delayDeliveryPageNextMs: 0,
      delayDeliveryStartsMs: 0,
      getJobList: () => [{ encryptJobId: 'job-1' }, { encryptJobId: 'job-2' }],
      getLocationHref: () => 'https://www.zhipin.com/web/geek/jobs',
      getRemainingTargetJobIds: () => remainingTargetJobIds,
      goNextPage: () => true,
      handleJobList: async () => ({ seenJobIds: ['job-1', 'job-2'] }),
      logDebug: vi.fn(),
      resetSelectionStatuses: false,
      shouldStop: () => false,
      wait: async () => {},
    })

    expect(result.stepMsg).toBe('定向投递完成，共处理 2 个目标岗位')
  })

  it('reports remaining target jobs when next page is unavailable', async () => {
    const result = await executeAgentBatchLoop({
      activeTargetJobIds: ['job-1'],
      consumeSeenJobIds: () => 1,
      delayDeliveryPageNextMs: 0,
      delayDeliveryStartsMs: 0,
      getJobList: () => [{ encryptJobId: 'job-9' }],
      getLocationHref: () => 'https://www.zhipin.com/web/geek/job-recommend',
      getRemainingTargetJobIds: () => ['job-1'],
      goNextPage: () => false,
      handleJobList: async () => ({ seenJobIds: [] }),
      logDebug: vi.fn(),
      resetSelectionStatuses: false,
      shouldStop: () => false,
      wait: async () => {},
    })

    expect(result.stepMsg).toBe('定向投递结束，仍有 1 个目标岗位未命中')
  })

  it('stops when max iterations is reached', async () => {
    const result = await executeAgentBatchLoop({
      activeTargetJobIds: [],
      consumeSeenJobIds: vi.fn(),
      delayDeliveryPageNextMs: 0,
      delayDeliveryStartsMs: 0,
      getJobList: () => [{ encryptJobId: 'job-1' }],
      getLocationHref: () => 'https://www.zhipin.com/web/geek/job',
      getRemainingTargetJobIds: () => [],
      goNextPage: () => true,
      handleJobList: async () => ({ seenJobIds: [] }),
      logDebug: vi.fn(),
      maxIterations: 2,
      resetSelectionStatuses: false,
      shouldStop: () => false,
      wait: async () => {},
    })

    expect(result.stepMsg).toBe('投递结束, 达到最大循环次数 2')
  })

  it('stops when max runtime is reached', async () => {
    let now = 0
    const result = await executeAgentBatchLoop({
      activeTargetJobIds: [],
      consumeSeenJobIds: vi.fn(),
      delayDeliveryPageNextMs: 0,
      delayDeliveryStartsMs: 0,
      getNow: () => now,
      getJobList: () => [{ encryptJobId: 'job-1' }],
      getLocationHref: () => 'https://www.zhipin.com/web/geek/jobs',
      getRemainingTargetJobIds: () => [],
      goNextPage: () => {
        now = 2000
        return true
      },
      handleJobList: async () => ({ seenJobIds: [] }),
      logDebug: vi.fn(),
      maxRuntimeMs: 1000,
      resetSelectionStatuses: false,
      shouldStop: () => false,
      wait: async () => {},
    })

    expect(result.stepMsg).toBe('投递结束, 达到最大运行时长 1 秒')
  })

  it('does not stop on repeated lists for routes disabled by adapter strategy', async () => {
    let nextCalls = 0
    const result = await executeAgentBatchLoop({
      activeTargetJobIds: [],
      consumeSeenJobIds: vi.fn(),
      delayDeliveryPageNextMs: 0,
      delayDeliveryStartsMs: 0,
      getJobList: () => [{ encryptJobId: 'job-1' }],
      getLocationHref: () => 'https://www.zhipin.com/web/geek/job',
      getRemainingTargetJobIds: () => [],
      goNextPage: () => {
        nextCalls += 1
        return false
      },
      handleJobList: async () => ({ seenJobIds: [] }),
      logDebug: vi.fn(),
      maxIterations: 3,
      resetSelectionStatuses: false,
      shouldStop: () => false,
      wait: async () => {},
    })

    expect(nextCalls).toBe(1)
    expect(result.stepMsg).toBe('投递结束, 无法继续下一页')
  })
})
