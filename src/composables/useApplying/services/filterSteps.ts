import { counter } from '@/message'
import { useUser } from '@/stores/user'
import {
  ActivityError,
  CompanyNameError,
  CompanySizeError,
  FriendStatusError,
  GoldHunterError,
  HrPositionError,
  JobAddressError,
  JobDescriptionError,
  JobTitleError,
  RepeatError,
  SalaryError,
} from '@/types/deliverError'
import type { FormData, Statistics } from '@/types/formData'

import type { StepFactory } from '../type'
import { errorHandle, rangeMatch, rangeMatchFormat } from '../utils'

type ToCause = (error: unknown) => { cause: Error } | undefined
type ApplyingStatistics = { todayData: Statistics }

export function createCommunicatedStep(statistics: ApplyingStatistics): StepFactory {
  return () => {
    return async ({ data }) => {
      if (data.contact) {
        statistics.todayData.repeat++
        throw new RepeatError('已经沟通过')
      }
    }
  }
}

export function createDuplicateFilter(options: {
  enabled: () => boolean
  storageKey: string
  getId: (data: bossZpJobItemData) => string | null | undefined
  errorMessage: string
  statistics: ApplyingStatistics
  userId: number | string | null
}): StepFactory {
  return () => {
    if (!options.enabled()) {
      return
    }

    let someSet: Set<string> | null = null
    let count = 0
    if (options.userId == null) {
      throw new RepeatError('没有获取到uid')
    }
    const userId = String(options.userId)

    return {
      fn: async ({ data }) => {
        if (someSet == null) {
          someSet = new Set<string>()
          const stored = await counter.storageGet<Record<string, string[]>>(options.storageKey, {})
          for (const id of stored[userId] ?? []) {
            someSet.add(id)
          }
        }

        const id = options.getId(data)
        if (id != null && someSet.has(id)) {
          options.statistics.todayData.repeat++
          throw new RepeatError(options.errorMessage)
        }
      },
      after: async ({ data }) => {
        const id = options.getId(data)
        if (id != null) {
          someSet?.add(id)
        }

        count++
        if (count > 3) {
          const oldData = await counter.storageGet<Record<string, string[]>>(options.storageKey, {})
          await counter.storageSet(options.storageKey, {
            ...oldData,
            [userId]: Array.from(someSet ?? []),
          })
          count = 0
        }
      },
    }
  }
}

export function createJobTitleStep(
  formData: FormData,
  statistics: ApplyingStatistics,
  toCause: ToCause,
): StepFactory {
  return () => {
    if (!formData.jobTitle.enable) {
      return
    }

    return async ({ data }) => {
      try {
        const text = data.jobName.toLowerCase()
        if (!text) throw new JobTitleError('岗位名为空')
        for (const x of formData.jobTitle.value) {
          if (text.includes(x.toLowerCase())) {
            if (formData.jobTitle.include) {
              return
            }
            throw new JobTitleError(`岗位名含有排除关键词 [${x}]`)
          }
        }
        if (formData.jobTitle.include) {
          throw new JobTitleError('岗位名不包含关键词')
        }
      } catch (error) {
        statistics.todayData.jobTitle++
        throw new JobTitleError(errorHandle(error), toCause(error))
      }
    }
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
      if (data.goldHunter === 1) {
        statistics.todayData.goldHunterFilter++
        throw new GoldHunterError('猎头过滤')
      }
    }
  }
}

export function createCompanyStep(
  formData: FormData,
  statistics: ApplyingStatistics,
  toCause: ToCause,
): StepFactory {
  return () => {
    if (!formData.company.enable) {
      return
    }

    return async ({ data }) => {
      try {
        const text = data.brandName
        if (!text) throw new CompanyNameError('公司名为空')

        for (const x of formData.company.value) {
          if (text.includes(x)) {
            if (formData.company.include) {
              return
            }
            throw new CompanyNameError(`公司名含有排除关键词 [${x}]`)
          }
        }
        if (formData.company.include) {
          throw new CompanyNameError('公司名不包含关键词')
        }
      } catch (error) {
        statistics.todayData.company++
        throw new CompanyNameError(errorHandle(error), toCause(error))
      }
    }
  }
}

export function createSalaryRangeStep(
  formData: FormData,
  statistics: ApplyingStatistics,
  toCause: ToCause,
): StepFactory {
  return () => {
    if (!formData.salaryRange.enable) {
      return
    }

    const units = [
      ['元/时', formData.salaryRange.advancedValue.H],
      ['元/天', formData.salaryRange.advancedValue.D],
      ['元/月', formData.salaryRange.advancedValue.M],
      ['K', formData.salaryRange.value],
    ] as const

    return async ({ data }) => {
      try {
        const text = data.salaryDesc
        for (const [unit, range] of units) {
          if (text.includes(unit) && !rangeMatch(text, range)) {
            throw new SalaryError(`不匹配的薪资范围 ${text}, 预期: ${rangeMatchFormat(range, unit)}`)
          }
        }
      } catch (error) {
        statistics.todayData.salaryRange++
        throw new SalaryError(errorHandle(error), toCause(error))
      }
    }
  }
}

export function createCompanySizeRangeStep(
  formData: FormData,
  statistics: ApplyingStatistics,
  toCause: ToCause,
): StepFactory {
  return () => {
    if (!formData.companySizeRange.enable) {
      return
    }

    return async ({ data }) => {
      try {
        const text = data.brandScaleName
        if (!rangeMatch(text, formData.companySizeRange.value)) {
          throw new CompanySizeError(
            `不匹配的公司规模 ${text}, 预期: ${rangeMatchFormat(formData.companySizeRange.value, '人')}`,
          )
        }
      } catch (error) {
        statistics.todayData.companySizeRange++
        throw new CompanySizeError(errorHandle(error), toCause(error))
      }
    }
  }
}

export function createJobContentStep(
  formData: FormData,
  statistics: ApplyingStatistics,
  toCause: ToCause,
): StepFactory {
  return () => {
    if (!formData.jobContent.enable) {
      return
    }

    return async (_, ctx) => {
      try {
        const content = ctx.listData.card?.postDescription.toLowerCase()
        for (const x of formData.jobContent.value) {
          if (!x) {
            continue
          }

          const re = new RegExp(`(?<!(不|无).{0,5})${x.toLowerCase()}(?!系统|软件|工具|服务)`)
          if (content != null && re.test(content)) {
            if (formData.jobContent.include) {
              return
            }
            throw new JobDescriptionError(`工作内容含有排除关键词 [${x}]`)
          }
        }

        if (formData.jobContent.include) {
          throw new JobDescriptionError('工作内容中不包含关键词')
        }
      } catch (error) {
        statistics.todayData.jobContent++
        throw new JobDescriptionError(errorHandle(error), toCause(error))
      }
    }
  }
}

export function createHrPositionStep(
  formData: FormData,
  statistics: ApplyingStatistics,
  toCause: ToCause,
): StepFactory {
  return () => {
    if (!formData.hrPosition.enable) {
      return
    }

    return async (_, ctx) => {
      try {
        const content = ctx.listData.card?.bossTitle
        for (const x of formData.hrPosition.value) {
          if (!x) {
            continue
          }

          if (content != null && content.trim() === x) {
            if (formData.hrPosition.include) {
              return
            }
            throw new HrPositionError(`Hr职位在黑名单中 ${content}`)
          }
        }

        if (formData.hrPosition.include) {
          throw new HrPositionError(`Hr职位不在白名单中: ${content}`)
        }
      } catch (error) {
        statistics.todayData.hrPosition++
        throw new HrPositionError(errorHandle(error), toCause(error))
      }
    }
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

    return async (_, ctx) => {
      try {
        if (formData.jobAddress.value.length === 0) {
          return
        }

        const content = ctx.listData.card?.address.trim()
        for (const x of formData.jobAddress.value) {
          if (!x) {
            continue
          }
          if (content?.includes(x)) {
            return
          }
        }

        throw new JobAddressError(`工作地址不包含关键词: ${content}`)
      } catch (error) {
        statistics.todayData.jobAddress++
        throw new JobAddressError(errorHandle(error), toCause(error))
      }
    }
  }
}

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

    return async (_, ctx) => {
      try {
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
      } catch (error) {
        statistics.todayData.activityFilter++
        throw new ActivityError(errorHandle(error), toCause(error))
      }
    }
  }
}

function amapHandler(id: string, limitDistance: number, limitDuration: number, amap?: {
  ok: boolean
  distance: number
  duration: number
}) {
  if (!amap || amap.ok === false) {
    throw new JobAddressError('高德地图未初始化')
  }
  if (limitDistance > 0 && amap.distance > limitDistance * 1000) {
    throw new JobAddressError(`${id}距离超标: ${amap.distance / 1000} 设定: ${limitDistance}`)
  }
  if (limitDuration > 0 && amap.duration > limitDuration * 60) {
    throw new JobAddressError(`${id}时间超标: ${amap.duration / 60} 设定: ${limitDuration}`)
  }
}

export function createAmapStep(formData: FormData): StepFactory {
  return () => {
    if (!formData.amap.enable) {
      return
    }

    return async (_, ctx) => {
      if (ctx.amap?.distance == null) {
        throw new JobAddressError('高德地图api数据异常')
      }

      amapHandler('直线', formData.amap.straightDistance, 0, ctx.amap.distance.straight)
      amapHandler(
        '驾车',
        formData.amap.drivingDistance,
        formData.amap.drivingDuration,
        ctx.amap.distance.driving,
      )
      amapHandler(
        '步行',
        formData.amap.walkingDistance,
        formData.amap.walkingDuration,
        ctx.amap.distance.walking,
      )
    }
  }
}

export function getCurrentApplyingUserId() {
  return useUser().getUserId()
}
