// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { createGoldHunterFilterStep } from '@/composables/useApplying/services/filterSteps'
import type { Handler } from '@/composables/useApplying/type'
import { defaultFormData } from '@/stores/conf'
import { GoldHunterError } from '@/types/deliverError'
import type { Statistics } from '@/types/formData'

function createStatistics(): Statistics {
  return {
    activityFilter: 0,
    aiFiltering: 0,
    amap: 0,
    company: 0,
    companySizeRange: 0,
    date: '2026-04-10',
    goldHunterFilter: 0,
    hrPosition: 0,
    jobAddress: 0,
    jobContent: 0,
    jobTitle: 0,
    repeat: 0,
    salaryRange: 0,
    success: 0,
    total: 0,
  }
}

describe('createGoldHunterFilterStep', () => {
  it('rejects gold hunter jobs and increments the statistic', async () => {
    const formData = structuredClone(defaultFormData)
    formData.goldHunterFilter.value = true
    const statistics = {
      todayData: createStatistics(),
    }
    const step = createGoldHunterFilterStep(formData, statistics)() as Handler

    await expect(step({ data: { goldHunter: 1 } } as never, {} as never)).rejects.toBeInstanceOf(GoldHunterError)
    expect(statistics.todayData.goldHunterFilter).toBe(1)
  })
})
