import { describe, expect, it } from 'vitest'

import {
  createCompanySizeRangeStep,
  createSalaryRangeStep,
} from '@/composables/useApplying/services/filters/range'
import type { ApplyingStatistics, ToCause } from '@/composables/useApplying/services/filters/shared'
import type { Handler, Step } from '@/composables/useApplying/type'
import { defaultFormData } from '@/stores/conf/info'
import { CompanySizeError, SalaryError } from '@/types/deliverError'

import { createJob, createLogContext } from './helpers/jobs'

function createStatistics(): ApplyingStatistics {
  return {
    todayData: {
      activityFilter: 0,
      aiFiltering: 0,
      amap: 0,
      company: 0,
      companySizeRange: 0,
      date: '2026-04-11',
      goldHunterFilter: 0,
      hrPosition: 0,
      jobAddress: 0,
      jobContent: 0,
      jobTitle: 0,
      repeat: 0,
      salaryRange: 0,
      success: 0,
      total: 0,
    },
  }
}

function createFormData() {
  return structuredClone(defaultFormData)
}

function getHandler(step: Step | undefined): Handler {
  if (typeof step !== 'function') {
    throw new TypeError('Expected handler step')
  }
  return step
}

const toCause: ToCause = (error) => (error instanceof Error ? { cause: error } : undefined)

describe('range filters', () => {
  it('returns undefined when salary and company size filters are disabled', () => {
    const formData = createFormData()
    const statistics = createStatistics()

    expect(createSalaryRangeStep(formData, statistics, toCause)()).toBeUndefined()
    expect(createCompanySizeRangeStep(formData, statistics, toCause)()).toBeUndefined()
  })

  it('matches advanced hourly ranges and records K-range mismatches', async () => {
    const statistics = createStatistics()
    const formData = createFormData()
    formData.salaryRange.enable = true
    formData.salaryRange.value = [10, 20, true]
    formData.salaryRange.advancedValue.H = [100, 200, true]
    const handler = getHandler(createSalaryRangeStep(formData, statistics, toCause)())

    const hourlyJob = createJob({ salaryDesc: '150元/时' })
    await expect(handler({ data: hourlyJob }, createLogContext(hourlyJob))).resolves.toBeUndefined()

    const salaryMismatchJob = createJob({ salaryDesc: '25-30K' })
    await expect(
      handler({ data: salaryMismatchJob }, createLogContext(salaryMismatchJob)),
    ).rejects.toBeInstanceOf(SalaryError)
    expect(statistics.todayData.salaryRange).toBe(1)
  })

  it('rejects company sizes outside the configured range', async () => {
    const statistics = createStatistics()
    const formData = createFormData()
    formData.companySizeRange.enable = true
    formData.companySizeRange.value = [500, 2000, true]
    const handler = getHandler(createCompanySizeRangeStep(formData, statistics, toCause)())

    const validJob = createJob({ brandScaleName: '500-2000人' })
    await expect(handler({ data: validJob }, createLogContext(validJob))).resolves.toBeUndefined()

    const invalidJob = createJob({ brandScaleName: '20-99人' })
    await expect(
      handler({ data: invalidJob }, createLogContext(invalidJob)),
    ).rejects.toBeInstanceOf(CompanySizeError)
    expect(statistics.todayData.companySizeRange).toBe(1)
  })
})
