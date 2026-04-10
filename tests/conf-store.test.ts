// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupPinia } from './helpers/pinia'

const { elMessageError, elMessageSuccess, mockUserStore } = vi.hoisted(() => ({
  elMessageError: vi.fn(),
  elMessageSuccess: vi.fn(),
  mockUserStore: {
    changeUser: vi.fn(async () => {}),
    getUserId: vi.fn(() => null),
  },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: Object.assign(vi.fn(), {
      closeAll: vi.fn(),
      error: elMessageError,
      info: vi.fn(),
      success: elMessageSuccess,
      warning: vi.fn(),
    }),
  }
})

vi.mock('@/stores/user', () => ({
  useUser: () => mockUserStore,
}))

import { counter } from '@/message'
import {
  applyFormDataMigrations,
  defaultFormData,
  formDataKey,
  useConf,
} from '@/stores/conf'
import { jsonClone } from '@/utils/deepmerge'

describe('useConf store', () => {
  beforeEach(() => {
    setupPinia()
    mockUserStore.getUserId.mockReset()
    mockUserStore.getUserId.mockReturnValue(null)
    mockUserStore.changeUser.mockClear()
    elMessageSuccess.mockClear()
    elMessageError.mockClear()
  })

  it('resets config fields back to cloned defaults with confDelete', () => {
    const conf = useConf()
    conf.formData.deliveryLimit.value = 1
    conf.formData.delay.deliveryInterval = 99
    conf.formData.salaryRange.value[0] = 99

    conf.confDelete()

    expect(conf.formData.deliveryLimit.value).toBe(defaultFormData.deliveryLimit.value)
    expect(conf.formData.delay.deliveryInterval).toBe(defaultFormData.delay.deliveryInterval)
    expect(conf.formData.salaryRange.value).toEqual(defaultFormData.salaryRange.value)

    conf.formData.salaryRange.value[0] = 77
    expect(defaultFormData.salaryRange.value[0]).toBe(8)
  })

  it('restores the recommended subset without mutating default form data', () => {
    const conf = useConf()
    const originalDelay = jsonClone(defaultFormData.delay)

    conf.formData.deliveryLimit.value = 1
    conf.formData.activityFilter.value = false
    conf.formData.friendStatus.value = false
    conf.formData.sameCompanyFilter.value = true
    conf.formData.sameHrFilter.value = false
    conf.formData.goldHunterFilter.value = true
    conf.formData.notification.value = false
    conf.formData.useCache.value = true
    conf.formData.delay.deliveryStarts = 11
    conf.formData.jobTitle.value = ['keep-me']

    conf.confRecommend()

    expect(conf.formData.deliveryLimit.value).toBe(defaultFormData.deliveryLimit.value)
    expect(conf.formData.activityFilter.value).toBe(defaultFormData.activityFilter.value)
    expect(conf.formData.friendStatus.value).toBe(defaultFormData.friendStatus.value)
    expect(conf.formData.sameCompanyFilter.value).toBe(defaultFormData.sameCompanyFilter.value)
    expect(conf.formData.sameHrFilter.value).toBe(defaultFormData.sameHrFilter.value)
    expect(conf.formData.goldHunterFilter.value).toBe(defaultFormData.goldHunterFilter.value)
    expect(conf.formData.notification.value).toBe(defaultFormData.notification.value)
    expect(conf.formData.useCache.value).toBe(defaultFormData.useCache.value)
    expect(conf.formData.delay).toEqual(defaultFormData.delay)
    expect(conf.formData.jobTitle.value).toEqual(['keep-me'])

    conf.formData.delay.deliveryStarts = 123
    expect(defaultFormData.delay).toEqual(originalDelay)
  })

  it('applies form data migrations from lowest to highest version', () => {
    const migrated = applyFormDataMigrations(
      {
        version: '20240401',
      },
      [
        [
          '20240501',
          (from) => ({
            ...from,
            greetingVariable: { value: true },
          }),
        ],
        [
          '20240601',
          (from) => ({
            ...from,
            deliveryLimit: { value: from.greetingVariable?.value ? 88 : 0 },
          }),
        ],
      ],
    )

    expect(migrated.version).toBe('20240601')
    expect(migrated.greetingVariable).toEqual({ value: true })
    expect(migrated.deliveryLimit).toEqual({ value: 88 })
  })

  it('migrates legacy persisted ranges during confInit', async () => {
    await counter.storageSet(formDataKey, {
      companySizeRange: {
        enable: true,
        value: '20-99',
      },
      salaryRange: {
        enable: true,
        value: '10-20',
      },
      version: '20240401',
    })

    const conf = useConf()
    await conf.confInit()

    expect(conf.formData.salaryRange.value).toEqual([10, 20, false])
    expect(conf.formData.companySizeRange.value).toEqual([20, 99, false])
  })
})
