import type { BossHelperAgentJobReviewPayload } from '@/message/agent'
import { useCommon } from '@/stores/common'
import { useLog, type logData } from '@/stores/log'
import { AIFilteringError } from '@/types/deliverError'

import { toAgentCurrentJob, toPendingReviewDetail } from '../shared/jobMapping'
import { createBossHelperAgentEvent, emitBossHelperAgentEvent } from './agentEvents'

interface PendingReviewEntry {
  ctx: logData
  reject: (reason?: unknown) => void
  resolve: (value: BossHelperAgentJobReviewPayload) => void
  threshold: number
  timeout: number
  timeoutMs: number
}

export type ExternalAIFilterReviewReasonCode =
  | 'external-review-pending'
  | 'external-review-accepted'
  | 'external-review-rejected'
  | 'external-review-timeout'
  | 'external-review-replaced'
  | 'external-review-manual-stop'
  | 'external-review-queue-overflow'

export type ExternalAIFilterReviewTimeoutSource = 'request-timeout'
export type ExternalAIFilterReviewReplacementCause = 'same-job-new-request'

export interface ExternalAIFilterReviewSnapshot {
  finalDecisionAt?: string
  handledBy?: 'external-agent' | 'system'
  queueDepth?: number
  queueOverflowLimit?: number
  reason?: string
  reasonCode?: ExternalAIFilterReviewReasonCode
  replacementCause?: ExternalAIFilterReviewReplacementCause
  replacementRunId?: string | null
  rating?: number
  status: 'pending' | 'accepted' | 'rejected'
  source?: 'external-ai-review'
  timeoutMs?: number
  timeoutSource?: ExternalAIFilterReviewTimeoutSource
  updatedAt: string
}

const pendingReviews = new Map<string, PendingReviewEntry>()
const reviewResults = new Map<string, {
  finalDecisionAt?: string
  handledBy?: 'external-agent' | 'system'
  queueDepth?: number
  queueOverflowLimit?: number
  reason?: string
  reasonCode?: ExternalAIFilterReviewReasonCode
  replacementCause?: ExternalAIFilterReviewReplacementCause
  replacementRunId?: string | null
  rating?: number
  status: 'pending' | 'accepted' | 'rejected'
  source?: 'external-ai-review'
  timeoutMs?: number
  timeoutSource?: ExternalAIFilterReviewTimeoutSource
  updatedAt: string
}>()
const MAX_PENDING_REVIEWS = 100

function createExternalReviewSnapshot(snapshot: ExternalAIFilterReviewSnapshot): ExternalAIFilterReviewSnapshot {
  return {
    source: 'external-ai-review',
    ...snapshot,
  }
}

function applyExternalReviewSnapshot(ctx: logData, snapshot: ExternalAIFilterReviewSnapshot) {
  ctx.review = createExternalReviewSnapshot(snapshot)
  return ctx.review
}

function getReviewQueueDepth(ctx: logData) {
  return typeof ctx.review?.queueDepth === 'number' ? ctx.review.queueDepth : undefined
}

function getReviewTimeoutMs(ctx: logData) {
  return typeof ctx.review?.timeoutMs === 'number' ? ctx.review.timeoutMs : undefined
}

export function getExternalAIFilterReviewSnapshot(
  encryptJobId: string,
): ExternalAIFilterReviewSnapshot | null {
  const review = reviewResults.get(encryptJobId)
  if (review) {
    return { ...review }
  }

  const pending = pendingReviews.get(encryptJobId)
  if (!pending) {
    return null
  }

  return {
    queueDepth: pendingReviews.size,
    reasonCode: 'external-review-pending',
    status: 'pending',
    source: 'external-ai-review',
    timeoutMs: pending.timeoutMs,
    updatedAt: new Date().toISOString(),
  }
}

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
  const snapshot = createExternalReviewSnapshot({
    finalDecisionAt: new Date().toISOString(),
    handledBy: 'external-agent',
    queueDepth: getReviewQueueDepth(pending.ctx),
    reason: payload.reason?.trim() || undefined,
    reasonCode: payload.accepted ? 'external-review-accepted' : 'external-review-rejected',
    rating: typeof payload.rating === 'number' ? payload.rating : undefined,
    timeoutMs: getReviewTimeoutMs(pending.ctx),
    status: payload.accepted ? 'accepted' : 'rejected',
    updatedAt: new Date().toISOString(),
  })
  applyExternalReviewSnapshot(pending.ctx, snapshot)
  reviewResults.set(payload.encryptJobId, snapshot)
  pending.resolve(payload)
  return true
}

export function abortAllPendingAIFilterReviews(reason = '外部审核已取消') {
  for (const [encryptJobId, pending] of pendingReviews) {
    window.clearTimeout(pending.timeout)
    const snapshot = createExternalReviewSnapshot({
      finalDecisionAt: new Date().toISOString(),
      handledBy: 'system',
      queueDepth: getReviewQueueDepth(pending.ctx),
      reason,
      reasonCode: 'external-review-manual-stop',
      status: 'rejected',
      timeoutMs: getReviewTimeoutMs(pending.ctx),
      updatedAt: new Date().toISOString(),
    })
    applyExternalReviewSnapshot(pending.ctx, snapshot)
    reviewResults.set(encryptJobId, snapshot)
    useLog().add(pending.ctx.listData, createPendingReviewOverflowError(reason, pending.threshold), {
      ...pending.ctx,
      review: snapshot,
    }, reason)
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
  const log = useLog()

  if (!pendingReviews.has(encryptJobId) && pendingReviews.size >= MAX_PENDING_REVIEWS) {
    const snapshot = createExternalReviewSnapshot({
      finalDecisionAt: new Date().toISOString(),
      handledBy: 'system',
      queueDepth: pendingReviews.size,
      queueOverflowLimit: MAX_PENDING_REVIEWS,
      reason: '外部审核队列已满，请稍后重试',
      reasonCode: 'external-review-queue-overflow',
      status: 'rejected',
      timeoutMs,
      updatedAt: new Date().toISOString(),
    })
    applyExternalReviewSnapshot(ctx, snapshot)
    reviewResults.set(encryptJobId, snapshot)
    log.add(ctx.listData, createPendingReviewOverflowError('外部审核队列已满，请稍后重试', threshold), {
      ...ctx,
      review: snapshot,
    }, '外部审核队列已满，请稍后重试')
    return Promise.reject(
      createPendingReviewOverflowError('外部审核队列已满，请稍后重试', threshold),
    )
  }

  return new Promise((resolve, reject) => {
    const pendingAt = new Date().toISOString()
    const timeout = window.setTimeout(() => {
      pendingReviews.delete(encryptJobId)
      const snapshot = createExternalReviewSnapshot({
        finalDecisionAt: new Date().toISOString(),
        handledBy: 'system',
        queueDepth: getReviewQueueDepth(ctx),
        reason: '外部审核超时',
        reasonCode: 'external-review-timeout',
        status: 'rejected',
        timeoutMs,
        timeoutSource: 'request-timeout',
        updatedAt: new Date().toISOString(),
      })
      applyExternalReviewSnapshot(ctx, snapshot)
      reviewResults.set(encryptJobId, snapshot)
      log.add(ctx.listData, createPendingReviewOverflowError('外部审核超时', threshold), {
        ...ctx,
        review: snapshot,
      }, '外部审核超时')
      reject(createPendingReviewOverflowError('外部审核超时', threshold))
    }, timeoutMs)

    const existing = pendingReviews.get(encryptJobId)
    if (existing) {
      window.clearTimeout(existing.timeout)
      const snapshot = createExternalReviewSnapshot({
        finalDecisionAt: new Date().toISOString(),
        handledBy: 'system',
        queueDepth: getReviewQueueDepth(existing.ctx),
        reason: '外部审核请求已被新的请求替换',
        reasonCode: 'external-review-replaced',
        replacementCause: 'same-job-new-request',
        replacementRunId: typeof ctx.runId === 'string' && ctx.runId ? ctx.runId : null,
        status: 'rejected',
        timeoutMs: getReviewTimeoutMs(existing.ctx),
        updatedAt: new Date().toISOString(),
      })
      applyExternalReviewSnapshot(existing.ctx, snapshot)
      log.add(existing.ctx.listData, createPendingReviewOverflowError('外部审核请求已被新的请求替换', existing.threshold), {
        ...existing.ctx,
        review: snapshot,
      }, '外部审核请求已被新的请求替换')
      existing.reject(
        createPendingReviewOverflowError('外部审核请求已被新的请求替换', existing.threshold),
      )
    }

    pendingReviews.set(encryptJobId, {
      ctx,
      resolve,
      reject,
      timeout,
      timeoutMs,
      threshold,
    })
    const pendingSnapshot = createExternalReviewSnapshot({
      queueDepth: pendingReviews.size,
      reason: '等待审核中',
      reasonCode: 'external-review-pending',
      status: 'pending',
      timeoutMs,
      updatedAt: pendingAt,
    })
    applyExternalReviewSnapshot(ctx, pendingSnapshot)
    reviewResults.set(encryptJobId, pendingSnapshot)
    log.add(ctx.listData, new AIFilteringError('等待外部审核', {
      accepted: false,
      reason: '等待审核中',
      source: 'external',
      threshold,
    }), {
      ...ctx,
      review: pendingSnapshot,
    }, '等待外部审核')

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
