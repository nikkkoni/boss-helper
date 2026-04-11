import { HrPositionError, JobAddressError } from '@/types/deliverError'
import type { FormData } from '@/types/formData'

import type { StepFactory } from '../../type'
import type { ApplyingStatistics, ToCause } from './shared'
import { withFilterError } from './shared'

export function createHrPositionStep(
  formData: FormData,
  statistics: ApplyingStatistics,
  toCause: ToCause,
): StepFactory {
  return () => {
    if (!formData.hrPosition.enable) {
      return
    }

    return async (_, ctx) =>
      withFilterError(statistics, 'hrPosition', HrPositionError, toCause, async () => {
        const content = ctx.listData.card?.bossTitle
        for (const keyword of formData.hrPosition.value) {
          if (keyword && content?.trim() === keyword) {
            if (formData.hrPosition.include) {
              return
            }
            throw new HrPositionError(`Hr职位在黑名单中 ${content}`)
          }
        }

        if (formData.hrPosition.include) {
          throw new HrPositionError(`Hr职位不在白名单中: ${content}`)
        }
      })
  }
}

export function createJobAddressStep(
  formData: FormData,
  statistics: ApplyingStatistics,
  toCause: ToCause,
): StepFactory {
  return () => {
    if (!formData.jobAddress.enable) {
      return
    }

    return async (_, ctx) =>
      withFilterError(statistics, 'jobAddress', JobAddressError, toCause, async () => {
        if (formData.jobAddress.value.length === 0) {
          return
        }

        const content = ctx.listData.card?.address.trim()
        for (const keyword of formData.jobAddress.value) {
          if (keyword && content?.includes(keyword)) {
            return
          }
        }

        throw new JobAddressError(`工作地址不包含关键词: ${content}`)
      })
  }
}
