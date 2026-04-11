// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createCommunicatedStep,
  createDuplicateFilter,
  getCurrentApplyingUserId,
} from '@/composables/useApplying/services/filters/dedup'
import type { ApplyingStatistics } from '@/composables/useApplying/services/filters/shared'
import { counter } from '@/message'
import { RepeatError } from '@/types/deliverError'

import { createJob, createLogContext } from './helpers/jobs'
import { setupPinia } from './helpers/pinia'
import { __resetMessageMock } from './mocks/message'

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

function getDuplicateStep(step: ReturnType<ReturnType<typeof createDuplicateFilter>>) {
  if (!step || typeof step === 'function') {
    throw new TypeError('Expected duplicate filter object step')
  }
  return step
}

describe('dedup filters', () => {
  beforeEach(() => {
    __resetMessageMock()
    setupPinia()
    window._PAGE = {
      uid: 42,
      userId: 42,
    } as Window['_PAGE']
  })

  it('rejects communicated jobs and reads the current applying user id', async () => {
    const statistics = createStatistics()
    const job = createJob({ contact: true })
    const step = createCommunicatedStep(statistics)()

    expect(getCurrentApplyingUserId()).toBe(42)
    if (typeof step !== 'function') {
      throw new TypeError('Expected communicated step handler')
    }

    await expect(step({ data: job }, createLogContext(job))).rejects.toBeInstanceOf(RepeatError)
    expect(statistics.todayData.repeat).toBe(1)
  })

  it('skips disabled duplicate filters and rejects missing user ids', () => {
    const statistics = createStatistics()

    expect(
      createDuplicateFilter({
        enabled: () => false,
        errorMessage: '重复公司',
        getId: (data) => data.encryptBrandId,
        statistics,
        storageKey: 'local:test-company',
        userId: 42,
      })(),
    ).toBeUndefined()

    expect(() =>
      createDuplicateFilter({
        enabled: () => true,
        errorMessage: '重复公司',
        getId: (data) => data.encryptBrandId,
        statistics,
        storageKey: 'local:test-company',
        userId: null,
      })(),
    ).toThrow(RepeatError)
  })

  it('rejects duplicates from storage and flushes cached ids after the dirty threshold', async () => {
    const statistics = createStatistics()
    await counter.storageSet('local:test-company', { 42: ['brand-seen'] })
    const storageSetSpy = vi.spyOn(counter, 'storageSet')
    const step = getDuplicateStep(
      createDuplicateFilter({
        enabled: () => true,
        errorMessage: '相同公司已投递',
        getId: (data) => data.encryptBrandId,
        statistics,
        storageKey: 'local:test-company',
        userId: 42,
      })(),
    )

    const duplicateJob = createJob({ encryptBrandId: 'brand-seen' })
    await expect(
      step.fn?.({ data: duplicateJob }, createLogContext(duplicateJob)),
    ).rejects.toBeInstanceOf(RepeatError)
    expect(statistics.todayData.repeat).toBe(1)

    for (const brandId of ['brand-a', 'brand-b', 'brand-c', 'brand-d']) {
      const job = createJob({ encryptBrandId: brandId })
      await step.fn?.({ data: job }, createLogContext(job))
      await step.after?.({ data: job }, createLogContext(job))
    }

    expect(storageSetSpy).toHaveBeenCalledTimes(1)
    expect(await counter.storageGet('local:test-company')).toEqual({
      42: ['brand-seen', 'brand-a', 'brand-b', 'brand-c', 'brand-d'],
    })
  })
})
