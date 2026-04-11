import { ActivityError, FriendStatusError, GoldHunterError } from '@/types/deliverError'
import type { FormData } from '@/types/formData'

import type { StepFactory } from '../../type'
import type { ApplyingStatistics, ToCause } from './shared'
import { withFilterError } from './shared'

export function createJobFriendStatusStep(formData: FormData): StepFactory {
  return () => {
    if (!formData.friendStatus.value) {
      return
    }

    return async (_, ctx) => {
      const content = ctx.listData.card?.friendStatus
      if (content != null && content !== 0) {
        throw new FriendStatusError('已经是好友了')
      }
    }
  }
}

export function createActivityFilterStep(
  formData: FormData,
  statistics: ApplyingStatistics,
  toCause: ToCause,
): StepFactory {
  return () => {
    if (!formData.activityFilter.value) {
      return
    }

    return async (_, ctx) =>
      withFilterError(statistics, 'activityFilter', ActivityError, toCause, async () => {
        const activeText = ctx.listData.card?.activeTimeDesc
        const activeTime = ctx.listData.card?.brandComInfo?.activeTime
        if (!activeText && !activeTime) {
          throw new ActivityError('无活跃内容,如果全失败请反馈')
        }
        if (!activeText && activeTime) {
          if (Date.now() - activeTime >= 7 * 24 * 60 * 60 * 1000) {
            throw new ActivityError(`不活跃 [${new Date(activeTime).toLocaleString()}]`)
          }
          return
        }
        if (activeText != null && (activeText.includes('月') || activeText.includes('年'))) {
          throw new ActivityError(`不活跃, [${activeText}]`)
        }
      })
  }
}

export function createGoldHunterFilterStep(
  formData: FormData,
  statistics: ApplyingStatistics,
): StepFactory {
  return () => {
    if (!formData.goldHunterFilter.value) {
      return
    }

    return async ({ data }) => {
      if (data.goldHunter !== 1) {
        return
      }
      statistics.todayData.goldHunterFilter++
      throw new GoldHunterError('猎头过滤')
    }
  }
}
