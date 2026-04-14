// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLog } from '@/stores/log'
import { AIFilteringError } from '@/types/deliverError'

import { createJob, createLogContext } from './helpers/jobs'
import { setupPinia } from './helpers/pinia'

const reviewMocks = vi.hoisted(() => ({
  common: {
    deliverState: 'running',
  },
  createBossHelperAgentEvent: vi.fn((payload) => payload),
  emitBossHelperAgentEvent: vi.fn(),
  toAgentCurrentJob: vi.fn((job: Record<string, unknown>) => job),
  toPendingReviewDetail: vi.fn(
    (ctx: { listData: { encryptJobId: string } }, threshold: number, timeoutMs: number) => ({
      encryptJobId: ctx.listData.encryptJobId,
      threshold,
      timeoutMs,
    }),
  ),
}))

vi.mock('@/stores/common', () => ({
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
    setupPinia()
    useLog().clear()
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
    const { getExternalAIFilterReviewSnapshot, requestExternalAIFilterReview, submitExternalAIFilterReview } =
      await import('@/pages/zhipin/hooks/agentReview')

    const ctx = createLogContext(createJob({ encryptJobId: 'job-review-1', jobName: 'Frontend' }))
    const reviewPromise = requestExternalAIFilterReview(ctx, 60, 1_000)
    expect(useLog().query().items[0]).toEqual(
      expect.objectContaining({
        message: '等待外部审核',
        state_name: 'AI筛选',
      }),
    )
    expect(getExternalAIFilterReviewSnapshot('job-review-1')).toEqual(
      expect.objectContaining({
        queueDepth: 1,
        reasonCode: 'external-review-pending',
        source: 'external-ai-review',
        status: 'pending',
        timeoutMs: 1_000,
      }),
    )

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
    expect(getExternalAIFilterReviewSnapshot('job-review-1')).toEqual(
      expect.objectContaining({
        finalDecisionAt: expect.any(String),
        handledBy: 'external-agent',
        queueDepth: 1,
        reason: 'strong match',
        reasonCode: 'external-review-accepted',
        rating: 85,
        status: 'accepted',
        source: 'external-ai-review',
        timeoutMs: 1_000,
      }),
    )

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
      getExternalAIFilterReviewSnapshot,
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
    expect(getExternalAIFilterReviewSnapshot('job-review-2')).toEqual(
      expect.objectContaining({
        finalDecisionAt: expect.any(String),
        handledBy: 'system',
        queueDepth: 1,
        reason: 'manual stop',
        reasonCode: 'external-review-manual-stop',
        status: 'rejected',
        source: 'external-ai-review',
        timeoutMs: 1_000,
      }),
    )
    expect(useLog().query({ limit: 5 }).items[0]).toEqual(
      expect.objectContaining({
        message: 'manual stop',
        state_name: 'AI筛选',
      }),
    )

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
    const { getExternalAIFilterReviewSnapshot, requestExternalAIFilterReview } = await import('@/pages/zhipin/hooks/agentReview')
    const reviewPromise = requestExternalAIFilterReview(
      createLogContext(createJob({ encryptJobId: 'job-review-3' })),
      55,
      500,
    )
    const errorPromise = reviewPromise.catch((error) => error)

    await vi.advanceTimersByTimeAsync(500)

    const error = await errorPromise
    expect(error).toBeInstanceOf(AIFilteringError)
    expect(getExternalAIFilterReviewSnapshot('job-review-3')).toEqual(
      expect.objectContaining({
        handledBy: 'system',
        queueDepth: 1,
        reasonCode: 'external-review-timeout',
        status: 'rejected',
        timeoutMs: 500,
        timeoutSource: 'request-timeout',
      }),
    )
    expect(useLog().query({ limit: 5 }).items[0]).toEqual(
      expect.objectContaining({
        message: '外部审核超时',
        state_name: 'AI筛选',
      }),
    )
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

  it('replaces pending reviews for the same job id and rejects when the queue is full', async () => {
    const { getExternalAIFilterReviewSnapshot, requestExternalAIFilterReview } = await import('@/pages/zhipin/hooks/agentReview')
    const firstCtx = createLogContext(createJob({ encryptJobId: 'job-review-replaced' }))
    const firstPromise = requestExternalAIFilterReview(
      firstCtx,
      60,
      1_000,
    )
    const replacedErrorPromise = firstPromise.catch((error) => error)

    const secondPromise = requestExternalAIFilterReview(
      createLogContext(createJob({ encryptJobId: 'job-review-replaced' })),
      70,
      1_000,
    )

    await expect(replacedErrorPromise).resolves.toMatchObject({
      aiScore: {
        reason: '外部审核请求已被新的请求替换',
        threshold: 60,
      },
    })
    expect(firstCtx.review).toEqual(
      expect.objectContaining({
        handledBy: 'system',
        queueDepth: 1,
        reasonCode: 'external-review-replaced',
        replacementCause: 'same-job-new-request',
        replacementRunId: null,
        status: 'rejected',
        timeoutMs: 1_000,
      }),
    )
    expect(useLog().query({ limit: 5 }).items[0]).toEqual(
      expect.objectContaining({
        message: '等待外部审核',
        state_name: 'AI筛选',
      }),
    )
    expect(useLog().query({ limit: 5 }).items[1]).toEqual(
      expect.objectContaining({
        message: '外部审核请求已被新的请求替换',
        state_name: 'AI筛选',
      }),
    )

    const overflowPromises = Array.from({ length: 100 }, (_, index) =>
      requestExternalAIFilterReview(
        createLogContext(createJob({ encryptJobId: `job-review-overflow-${index}` })),
        50,
        1_000,
      ),
    )
    const overflowCtx = createLogContext(createJob({ encryptJobId: 'job-review-overflow-final' }))
    const overflowError = await requestExternalAIFilterReview(
      overflowCtx,
      80,
      1_000,
    ).catch((error) => error)

    expect(overflowError).toMatchObject({
      aiScore: {
        reason: '外部审核队列已满，请稍后重试',
        threshold: 80,
      },
      message: '外部审核队列已满，请稍后重试',
    })
    expect(overflowCtx.review).toEqual(
      expect.objectContaining({
        handledBy: 'system',
        queueDepth: 100,
        queueOverflowLimit: 100,
        reasonCode: 'external-review-queue-overflow',
        status: 'rejected',
        timeoutMs: 1_000,
      }),
    )
    expect(getExternalAIFilterReviewSnapshot('job-review-overflow-final')).toEqual(
      expect.objectContaining({
        reasonCode: 'external-review-queue-overflow',
      }),
    )
    expect(useLog().query({ limit: 5 }).items[0]).toEqual(
      expect.objectContaining({
        message: '外部审核队列已满，请稍后重试',
        state_name: 'AI筛选',
      }),
    )

    void secondPromise.catch(() => undefined)
    for (const promise of overflowPromises) {
      void promise.catch(() => undefined)
    }
  })
})
