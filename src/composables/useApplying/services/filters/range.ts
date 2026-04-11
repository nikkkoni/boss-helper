import { CompanySizeError, SalaryError } from '@/types/deliverError'
import type { FormData } from '@/types/formData'

import { rangeMatch, rangeMatchFormat } from '../../rangeMatch'
import type { StepFactory } from '../../type'
import type { ApplyingStatistics, ToCause } from './shared'
import { withFilterError } from './shared'

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

    return async ({ data }) =>
      withFilterError(statistics, 'salaryRange', SalaryError, toCause, async () => {
        for (const [unit, range] of units) {
          if (data.salaryDesc.includes(unit) && !rangeMatch(data.salaryDesc, range)) {
            throw new SalaryError(
              `不匹配的薪资范围 ${data.salaryDesc}, 预期: ${rangeMatchFormat(range, unit)}`,
            )
          }
        }
      })
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

    return async ({ data }) =>
      withFilterError(statistics, 'companySizeRange', CompanySizeError, toCause, async () => {
        if (!rangeMatch(data.brandScaleName, formData.companySizeRange.value)) {
          throw new CompanySizeError(
            `不匹配的公司规模 ${data.brandScaleName}, 预期: ${rangeMatchFormat(formData.companySizeRange.value, '人')}`,
          )
        }
      })
  }
}
