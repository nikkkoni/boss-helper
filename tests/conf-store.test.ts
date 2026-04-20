// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupPinia } from './helpers/pinia'

const { elMessageError, elMessageSuccess, mockUserStore } = vi.hoisted(() => ({
  elMessageError: vi.fn(),
  elMessageSuccess: vi.fn(),
  mockUserStore: {
    changeUser: vi.fn(async () => {}),
    getUserId: vi.fn(() => null),
    registerUserConfigSnapshotGetter: vi.fn(),
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
  registerUserConfigSnapshotGetter: mockUserStore.registerUserConfigSnapshotGetter,
  useUser: () => mockUserStore,
}))

import { counter } from '@/message'
import {
  applyFormDataMigrations,
  amapKeyStorageKey,
  defaultFormData,
  formDataKey,
  formDataTemplatesKey,
  legacyAmapKeyStorageKey,
  useConf,
} from '@/stores/conf'
import type { FormData, PersistedFormData } from '@/types/formData'
import { jsonClone } from '@/utils/deepmerge'

type PersistedFormDataWithLegacyFlag = PersistedFormData & {
  legacyFlag?: { value: boolean }
}

describe('useConf store', () => {
  beforeEach(() => {
    setupPinia()
    mockUserStore.getUserId.mockReset()
    mockUserStore.getUserId.mockReturnValue(null)
    mockUserStore.changeUser.mockClear()
    mockUserStore.registerUserConfigSnapshotGetter.mockClear()
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
            legacyFlag: { value: true },
          }) as PersistedFormDataWithLegacyFlag,
        ],
        [
          '20240601',
          (from) => ({
            ...from,
            deliveryLimit: {
              value: (from as PersistedFormDataWithLegacyFlag).legacyFlag?.value ? 88 : 0,
            },
          }) as PersistedFormDataWithLegacyFlag,
        ],
      ],
    )

    expect(migrated.version).toBe('20240601')
    expect((migrated as PersistedFormDataWithLegacyFlag).legacyFlag).toEqual({ value: true })
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

  it('hydrates session amap keys, loads templates, and persists runtime patches', async () => {
    await counter.storageSet(legacyAmapKeyStorageKey, 'legacy-sync-amap')
    await counter.storageSet(formDataKey, {
      amap: {
        key: 'legacy-amap',
      },
      deliveryLimit: {
        value: 6,
      },
      version: '20250826',
    })
    await counter.storageSet(formDataTemplatesKey, {
      Zebra: {
        deliveryLimit: { value: 3 },
      },
      Alpha: {
        useCache: { value: false },
      },
    })

    const conf = useConf()
    await conf.confInit()

    expect(conf.isLoaded).toBe(true)
    expect(conf.formData.deliveryLimit.value).toBe(6)
    expect(conf.formData.amap.key).toBe('legacy-sync-amap')
    expect(conf.templateNames).toEqual(['Alpha', 'Zebra'])
    expect(await counter.storageGet(amapKeyStorageKey)).toBe('legacy-sync-amap')
    expect(await counter.storageGet(legacyAmapKeyStorageKey)).toBeNull()
    expect((await counter.storageGet<Partial<FormData>>(formDataKey, {}))?.amap?.key).toBe('')

    const snapshot = await conf.applyRuntimeConfigPatch(
      {
        deliveryLimit: { value: 8 },
        userId: 999,
        version: 'override',
      } as never,
      { persist: true },
    )

    expect(snapshot.deliveryLimit.value).toBe(8)
    expect(snapshot.userId).not.toBe(999)
    expect(
      (await counter.storageGet<Partial<FormData>>(formDataKey, {}))?.deliveryLimit?.value,
    ).toBe(8)
    expect((await counter.storageGet<Partial<FormData>>(formDataKey, {}))?.amap?.key).toBe('')
  })

  it('saves, applies, deletes, reloads, exports, and imports templates and config', async () => {
    const conf = useConf()
    conf.formData.deliveryLimit.value = 7
    conf.formData.amap.key = 'session-key'

    await conf.saveTemplate('  Team A  ')
    expect(conf.templateNames).toEqual(['Team A'])
    expect(elMessageSuccess).toHaveBeenCalledWith('模板已保存: Team A')

    conf.formData.deliveryLimit.value = 1
    conf.formData.sameCompanyFilter.value = true
    await conf.applyTemplate('Team A')
    expect(conf.formData.deliveryLimit.value).toBe(7)
    expect(conf.formData.amap.key).toBe('')
    expect(conf.formData.sameCompanyFilter.value).toBe(defaultFormData.sameCompanyFilter.value)

    await conf.deleteTemplate('Team A')
    expect(conf.templateNames).toEqual([])

    await expect(conf.saveTemplate('   ')).rejects.toThrow('模板名称不能为空')
    await expect(conf.applyTemplate('missing')).rejects.toThrow('模板不存在')
    await expect(conf.deleteTemplate('missing')).rejects.toThrow('模板不存在')

    conf.formData.deliveryLimit.value = 9
    conf.formData.amap.key = 'session-key'
    await conf.confSaving()
    expect(await counter.storageGet(formDataKey, {})).toEqual(
      expect.objectContaining({
        deliveryLimit: expect.objectContaining({ value: 9 }),
      }),
    )
    expect(await counter.storageGet(amapKeyStorageKey)).toBe('session-key')

    conf.formData.deliveryLimit.value = 2
    await conf.confReload()
    expect(conf.formData.deliveryLimit.value).toBe(9)
    expect(conf.formData.amap.key).toBe('session-key')
  })

  it('handles account switching, import cancellation, import failures, and save failures', async () => {
    const conf = useConf()

    mockUserStore.getUserId.mockReturnValue(2 as unknown as null)
    await counter.storageSet(formDataKey, {
      userId: 1,
      version: '20250826',
    })

    await conf.confInit()
    expect(mockUserStore.changeUser).not.toHaveBeenCalled()
    expect(conf.formData.userId).toBe(2)
    expect(elMessageSuccess).toHaveBeenCalledWith('检测到当前页面账号已变化，已切换为当前账号配置作用域')

    mockUserStore.getUserId.mockReturnValue(3 as unknown as null)
    await counter.storageSet(formDataKey, {
      userId: 1,
      version: '20250826',
    })

    await conf.confInit()
    expect(mockUserStore.changeUser).not.toHaveBeenCalled()
    expect(conf.formData.userId).toBe(3)
    expect(elMessageSuccess).toHaveBeenCalledWith('检测到当前页面账号已变化，已切换为当前账号配置作用域')

    const exportJsonSpy = vi
      .spyOn(await import('@/utils/jsonImportExport'), 'exportJson')
      .mockImplementation(() => undefined)
    await conf.confExport()
    expect(exportJsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amap: expect.objectContaining({ key: '' }) }),
      '投递配置',
    )

    const importModule = await import('@/utils/jsonImportExport')
    vi.spyOn(importModule, 'importJson').mockRejectedValueOnce(
      new importModule.ImportJsonCancelledError(),
    )
    await expect(conf.confImport()).resolves.toBeUndefined()

    vi.spyOn(importModule, 'importJson').mockResolvedValueOnce({
      amap: {
        key: 'new-key',
      },
      friendStatus: {
        value: false,
      },
      deliveryLimit: {
        value: 11,
      },
      userId: 99,
    } as never)
    conf.formData.friendStatus.value = true
    await conf.confImport()
    expect(conf.formData.deliveryLimit.value).toBe(11)
    expect(conf.formData.friendStatus.value).toBe(false)
    expect(await counter.storageGet(amapKeyStorageKey)).toBe('new-key')
    expect(await counter.storageGet(formDataKey, {})).toEqual(
      expect.objectContaining({
        deliveryLimit: expect.objectContaining({ value: 11 }),
        friendStatus: expect.objectContaining({ value: false }),
      }),
    )

    vi.spyOn(importModule, 'importJson').mockRejectedValueOnce(new Error('bad import'))
    await conf.confImport()
    expect(elMessageError).toHaveBeenCalledWith('bad import')

    vi.spyOn(counter, 'storageSet').mockRejectedValueOnce(new Error('save failed'))
    await conf.confSaving()
    expect(elMessageError).toHaveBeenCalledWith('保存失败: save failed')
  })

  it('resets missing fields to defaults before applying imported config', async () => {
    const conf = useConf()
    conf.formData.sameCompanyFilter.value = true
    conf.formData.notification.value = false

    const importModule = await import('@/utils/jsonImportExport')
    vi.spyOn(importModule, 'importJson').mockResolvedValueOnce({
      deliveryLimit: {
        value: 15,
      },
    } as never)

    await conf.confImport()

    expect(conf.formData.deliveryLimit.value).toBe(15)
    expect(conf.formData.sameCompanyFilter.value).toBe(defaultFormData.sameCompanyFilter.value)
    expect(conf.formData.notification.value).toBe(defaultFormData.notification.value)
  })
})
