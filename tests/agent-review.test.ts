// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AIFilteringError } from '@/types/deliverError'

import { createJob, createLogContext } from './helpers/jobs'

const reviewMocks = vi.hoisted(() => ({
  common: {
    deliverState: 'running',
  },
  createBossHelperAgentEvent: vi.fn((payload) => payload),
  emitBossHelperAgentEvent: vi.fn(),
  toAgentCurrentJob: vi.fn((job: Record<string, unknown>) => job),
  toPendingReviewDetail: vi.fn((ctx: { listData: { encryptJobId: string } }, threshold: number, timeoutMs: number) => ({
    encryptJobId: ctx.listData.encryptJobId,
    threshold,
    timeoutMs,
  })),
}))

vi.mock('@/composables/useCommon', () => ({
  useCommon: () => reviewMocks.common,
}))

vi.mock('@/pages/zhipin/shared/jobMapping', () => ({
  toAgentCurrentJob: reviewMocks.toAgentCurrentJob,
  toPendingReviewDetail: reviewMocks.toPendingReviewDetail,
}))

vi.mock('@/pages/zhipin/hooks/agentEvents', () => ({
  createBossHelperAgentEvent: reviewMocks.createBossHelperAgentEvent,
  emitBossHelperAgentEvent: reviewMocks.emitBossHelperAgentEvent,
}))

describe('agentReview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reviewMocks.createBossHelperAgentEvent.mockClear()
    reviewMocks.emitBossHelperAgentEvent.mockReset()
    reviewMocks.toAgentCurrentJob.mockClear()
    reviewMocks.toPendingReviewDetail.mockClear()
  })

  afterEach(async () => {
    const { abortAllPendingAIFilterReviews } = await import('@/pages/zhipin/hooks/agentReview')
    abortAllPendingAIFilterReviews('cleanup')
    vi.useRealTimers()
  })

  it('emits pending review events and resolves matching external reviews', async () => {
    const {
      requestExternalAIFilterReview,
      submitExternalAIFilterReview,
    } = await import('@/pages/zhipin/hooks/agentReview')

    const ctx = createLogContext(createJob({ encryptJobId: 'job-review-1', jobName: 'Frontend' }))
    const reviewPromise = requestExternalAIFilterReview(ctx, 60, 1_000)

    expect(reviewMocks.emitBossHelperAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          encryptJobId: 'job-review-1',
          threshold: 60,
          timeoutMs: 1_000,
        },
        message: '等待外部审核: Frontend',
        type: 'job-pending-review',
      }),
    )
    expect(reviewMocks.toAgentCurrentJob).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptJobId: 'job-review-1',
        message: '未提供分数\n结论:等待审核中\n阈值:60',
      }),
    )

    expect(
      submitExternalAIFilterReview({
        accepted: true,
        encryptJobId: 'job-review-1',
        rating: 85,
        reason: 'strong match',
      }),
    ).toBe(true)

    await expect(reviewPromise).resolves.toEqual(
      expect.objectContaining({
        accepted: true,
        encryptJobId: 'job-review-1',
        rating: 85,
      }),
    )
  })

  it('rejects all pending reviews when aborted and returns false for unknown jobs', async () => {
    const {
      abortAllPendingAIFilterReviews,
      requestExternalAIFilterReview,
      submitExternalAIFilterReview,
    } = await import('@/pages/zhipin/hooks/agentReview')

    expect(
      submitExternalAIFilterReview({
        accepted: true,
        encryptJobId: 'missing-job',
      }),
    ).toBe(false)

    const reviewPromise = requestExternalAIFilterReview(
      createLogContext(createJob({ encryptJobId: 'job-review-2' })),
      70,
      1_000,
    )

    abortAllPendingAIFilterReviews('manual stop')

    await expect(reviewPromise).rejects.toMatchObject({
      aiScore: {
        accepted: false,
        reason: 'manual stop',
        source: 'external',
        threshold: 70,
      },
      message: 'manual stop',
      name: 'AI筛选',
    })
  })

  it('rejects timed out external reviews with an AI filtering error', async () => {
    const { requestExternalAIFilterReview } = await import('@/pages/zhipin/hooks/agentReview')
    const reviewPromise = requestExternalAIFilterReview(
      createLogContext(createJob({ encryptJobId: 'job-review-3' })),
      55,
      500,
    )
    const errorPromise = reviewPromise.catch((error) => error)

    await vi.advanceTimersByTimeAsync(500)

    const error = await errorPromise
    expect(error).toBeInstanceOf(AIFilteringError)
    expect(error).toMatchObject({
      aiScore: {
        accepted: false,
        reason: '外部审核超时',
        source: 'external',
        threshold: 55,
      },
      message: '外部审核超时',
      name: 'AI筛选',
    })
  })
})
