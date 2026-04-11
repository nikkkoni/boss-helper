import type { BossHelperAgentJobReviewPayload } from '@/message/agent'
import { useCommon } from '@/composables/useCommon'
import type { logData } from '@/stores/log'
import { AIFilteringError } from '@/types/deliverError'

import { toAgentCurrentJob, toPendingReviewDetail } from '../shared/jobMapping'
import { createBossHelperAgentEvent, emitBossHelperAgentEvent } from './agentEvents'

interface PendingReviewEntry {
  reject: (reason?: unknown) => void
  resolve: (value: BossHelperAgentJobReviewPayload) => void
  threshold: number
  timeout: number
}

const pendingReviews = new Map<string, PendingReviewEntry>()
const MAX_PENDING_REVIEWS = 100

function createPendingReviewOverflowError(reason: string, threshold: number) {
  return new AIFilteringError(reason, {
    accepted: false,
    reason,
    source: 'external',
    threshold,
  })
}

function formatExternalReviewMessage(review: BossHelperAgentJobReviewPayload, threshold: number) {
  const ratingText = typeof review.rating === 'number' ? `分数${review.rating}` : '未提供分数'
  const reasonText = review.reason?.trim() || (review.accepted ? '外部审核通过' : '外部审核未通过')
  return `${ratingText}\n结论:${reasonText}\n阈值:${threshold}`
}

export function submitExternalAIFilterReview(payload: BossHelperAgentJobReviewPayload) {
  const pending = pendingReviews.get(payload.encryptJobId)
  if (!pending) {
    return false
  }

  window.clearTimeout(pending.timeout)
  pendingReviews.delete(payload.encryptJobId)
  pending.resolve(payload)
  return true
}

export function abortAllPendingAIFilterReviews(reason = '外部审核已取消') {
  for (const [encryptJobId, pending] of pendingReviews) {
    window.clearTimeout(pending.timeout)
    pending.reject(
      new AIFilteringError(reason, {
        accepted: false,
        reason,
        source: 'external',
        threshold: pending.threshold,
      }),
    )
    pendingReviews.delete(encryptJobId)
  }
}

export function requestExternalAIFilterReview(
  ctx: logData,
  threshold: number,
  timeoutMs: number,
): Promise<BossHelperAgentJobReviewPayload> {
  const encryptJobId = ctx.listData.encryptJobId
  const common = useCommon()

  if (!pendingReviews.has(encryptJobId) && pendingReviews.size >= MAX_PENDING_REVIEWS) {
    return Promise.reject(createPendingReviewOverflowError('外部审核队列已满，请稍后重试', threshold))
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingReviews.delete(encryptJobId)
      reject(
        createPendingReviewOverflowError('外部审核超时', threshold),
      )
    }, timeoutMs)

    const existing = pendingReviews.get(encryptJobId)
    if (existing) {
      window.clearTimeout(existing.timeout)
      existing.reject(createPendingReviewOverflowError('外部审核请求已被新的请求替换', existing.threshold))
    }

    pendingReviews.set(encryptJobId, {
      resolve,
      reject,
      timeout,
      threshold,
    })

    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type: 'job-pending-review',
        state: common.deliverState,
        message: `等待外部审核: ${ctx.listData.jobName || encryptJobId}`,
        detail: toPendingReviewDetail(ctx, threshold, timeoutMs),
        job: toAgentCurrentJob({
          encryptJobId,
          jobName: ctx.listData.jobName ?? '',
          brandName: ctx.listData.brandName ?? '',
          status: ctx.listData.status.status,
          message: formatExternalReviewMessage(
            {
              encryptJobId,
              accepted: false,
              reason: '等待审核中',
            },
            threshold,
          ),
        }),
      }),
    )
  })
}
