import { CompanyNameError, JobDescriptionError, JobTitleError } from '@/types/deliverError'
import type { FormData } from '@/types/formData'

import type { StepFactory } from '../../type'
import { escapeRegExp, type ApplyingStatistics, type ToCause, withFilterError } from './shared'

export function createJobTitleStep(
  formData: FormData,
  statistics: ApplyingStatistics,
  toCause: ToCause,
): StepFactory {
  return () => {
    if (!formData.jobTitle.enable) {
      return
    }

    return async ({ data }) =>
      withFilterError(statistics, 'jobTitle', JobTitleError, toCause, async () => {
        const text = data.jobName.toLowerCase()
        if (!text) throw new JobTitleError('岗位名为空')

        for (const keyword of formData.jobTitle.value) {
          if (!text.includes(keyword.toLowerCase())) {
            continue
          }
          if (formData.jobTitle.include) {
            return
          }
          throw new JobTitleError(`岗位名含有排除关键词 [${keyword}]`)
        }

        if (formData.jobTitle.include) {
          throw new JobTitleError('岗位名不包含关键词')
        }
      })
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

    return async ({ data }) =>
      withFilterError(statistics, 'company', CompanyNameError, toCause, async () => {
        const text = data.brandName
        if (!text) throw new CompanyNameError('公司名为空')

        for (const keyword of formData.company.value) {
          if (!text.includes(keyword)) {
            continue
          }
          if (formData.company.include) {
            return
          }
          throw new CompanyNameError(`公司名含有排除关键词 [${keyword}]`)
        }

        if (formData.company.include) {
          throw new CompanyNameError('公司名不包含关键词')
        }
      })
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

    const compiledKeywords = formData.jobContent.value.filter(Boolean).map((keyword) => ({
      keyword,
      pattern: new RegExp(
        `(?<!(不|无).{0,5})${escapeRegExp(keyword.toLowerCase())}(?!系统|软件|工具|服务)`,
      ),
    }))

    return async (_, ctx) =>
      withFilterError(statistics, 'jobContent', JobDescriptionError, toCause, async () => {
        const content = ctx.listData.card?.postDescription.toLowerCase()
        for (const { keyword, pattern } of compiledKeywords) {
          if (content == null || !pattern.test(content)) {
            continue
          }
          if (formData.jobContent.include) {
            return
          }
          throw new JobDescriptionError(`工作内容含有排除关键词 [${keyword}]`)
        }

        if (formData.jobContent.include) {
          throw new JobDescriptionError('工作内容中不包含关键词')
        }
      })
  }
}
