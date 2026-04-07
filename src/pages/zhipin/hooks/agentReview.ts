import type { BossHelperAgentJobReviewPayload } from '@/message/agent'
import { useCommon } from '@/composables/useCommon'
import type { logData } from '@/stores/log'
import { AIFilteringError } from '@/types/deliverError'

import { createBossHelperAgentEvent, emitBossHelperAgentEvent } from './agentEvents'

interface PendingReviewEntry {
  reject: (reason?: unknown) => void
  resolve: (value: BossHelperAgentJobReviewPayload) => void
  threshold: number
  timeout: number
}

const pendingReviews = new Map<string, PendingReviewEntry>()

function formatExternalReviewMessage(review: BossHelperAgentJobReviewPayload, threshold: number) {
  const ratingText = typeof review.rating === 'number' ? `分数${review.rating}` : '未提供分数'
  const reasonText = review.reason?.trim() || (review.accepted ? '外部审核通过' : '外部审核未通过')
  return `${ratingText}\n结论:${reasonText}\n阈值:${threshold}`
}

function toPendingReviewDetail(ctx: logData, threshold: number, timeoutMs: number) {
  return {
    encryptJobId: ctx.listData.encryptJobId,
    threshold,
    timeoutMs,
    job: {
      encryptJobId: ctx.listData.encryptJobId,
      jobName: ctx.listData.card?.jobName ?? ctx.listData.jobName ?? '',
      brandName: ctx.listData.card?.brandName ?? ctx.listData.brandName ?? '',
      salaryDesc: ctx.listData.card?.salaryDesc ?? ctx.listData.salaryDesc ?? '',
      cityName: ctx.listData.card?.cityName ?? ctx.listData.cityName ?? '',
      areaDistrict: ctx.listData.areaDistrict ?? '',
      degreeName: ctx.listData.card?.degreeName ?? '',
      experienceName: ctx.listData.card?.experienceName ?? '',
      address: ctx.listData.card?.address ?? '',
      welfareList: ctx.listData.welfareList ?? [],
      skills: ctx.listData.skills ?? [],
      jobLabels: ctx.listData.card?.jobLabels ?? ctx.listData.jobLabels ?? [],
      bossName: ctx.listData.card?.bossName ?? ctx.listData.bossName ?? '',
      bossTitle: ctx.listData.card?.bossTitle ?? ctx.listData.bossTitle ?? '',
      activeTimeDesc: ctx.listData.card?.activeTimeDesc ?? '',
      postDescription: ctx.listData.card?.postDescription ?? '',
    },
  }
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

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingReviews.delete(encryptJobId)
      reject(
        new AIFilteringError('外部审核超时', {
          accepted: false,
          reason: '外部审核超时',
          source: 'external',
          threshold,
        }),
      )
    }, timeoutMs)

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
        job: {
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
        },
      }),
    )
  })
}