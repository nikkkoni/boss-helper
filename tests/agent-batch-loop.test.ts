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
})