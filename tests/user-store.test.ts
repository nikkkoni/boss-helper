// @vitest-environment jsdom

import { ElMessage } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

const { getRootVueMock } = vi.hoisted(() => ({
  getRootVueMock: vi.fn(),
}))

vi.mock('@/composables/useVue', () => ({
  getRootVue: getRootVueMock,
}))

import { counter } from '@/message'
import { defaultFormData, formDataKey, useConf } from '@/stores/conf'
import { useUser, waitForRootUserInfo } from '@/stores/user'

import { setupPinia } from './helpers/pinia'

describe('stores/user', () => {
  beforeEach(() => {
    setupPinia()
    const user = useUser()
    useConf()
    user.info.value = undefined
    user.resume.value = undefined
    document.cookie = 'bst=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    getRootVueMock.mockReset()
  })

  it('stores unknown gender instead of defaulting to woman', async () => {
    const user = useUser()
    const conf = useConf()
    user.info.value = {
      gender: undefined,
      largeAvatar: '',
      name: 'Boss Helper',
      showName: 'Boss Helper',
      studentFlag: false,
      tinyAvatar: '',
      userId: 7,
    } as any
    conf.formData.amap.key = 'secret-amap-key'
    conf.formData.deliveryLimit.value = 88

    const saved = await user.saveUser({ uid: 7 })

    expect(saved.gender).toBe('unknown')
    expect(saved.form).toEqual(
      expect.objectContaining({
        amap: expect.objectContaining({
          key: '',
        }),
        deliveryLimit: expect.objectContaining({
          value: 88,
        }),
      }),
    )
  })

  it('loads user info from watched root vue state without interval polling', async () => {
    const rootState = reactive<{ userInfo?: Record<string, unknown> }>({})

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const initPromise = waitForRootUserInfo(rootState as never)

    rootState.userInfo = {
      name: 'Alice',
      showName: 'Alice',
      userId: 9,
    }

    await expect(initPromise).resolves.toEqual(
      expect.objectContaining({
        showName: 'Alice',
        userId: 9,
      }),
    )
    expect(useUser().info.value).toEqual(expect.objectContaining({ showName: 'Alice', userId: 9 }))
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('falls back to encryptUserId for account-scoped operations when numeric ids are unavailable', () => {
    const user = useUser()

    user.info.value = {
      encryptUserId: 'encrypted-info-user',
      userId: undefined,
    } as any
    expect(user.getUserScopeId()).toBe('encrypted-info-user')

    user.info.value = undefined
    window._PAGE = {
      encryptUserId: 'encrypted-page-user',
    } as Window['_PAGE']
    expect(user.getUserScopeId()).toBe('encrypted-page-user')

    user.info.value = {
      encryptUserId: 'encrypted-info-user',
      userId: 42,
    } as any
    expect(user.getUserScopeId()).toBe(42)
  })

  it('keeps literal "undefined" text from resume content while skipping missing fields', async () => {
    const user = useUser()
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            message: 'ok',
            zpData: {
              applyStatus: 0,
              baseInfo: {
                age: '28',
                gender: 0,
                nickName: 'Alice',
              },
              projectExpList: [
                {
                  name: 'Parser',
                  performance: 'fixed undefined handling',
                  projectDesc: undefined,
                  roleName: undefined,
                  startDate: '2024.01',
                },
              ],
              workExpList: [
                {
                  companyName: 'Acme',
                  emphasis: undefined,
                  endDate: undefined,
                  positionName: 'Frontend',
                  startDate: '2023.01',
                  workContent: 'worked on undefined-safe parsing',
                  workPerformance: undefined,
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const resumeText = await user.getUserResumeString({})

    expect(resumeText).toContain('worked on undefined-safe parsing')
    expect(resumeText).toContain('fixed undefined handling')
    expect(resumeText).not.toContain('(undefined)')
    expect(resumeText).not.toContain('undefined-undefined')
  })

  it('includes unknown gender in resume text when the API omits a known value', async () => {
    const user = useUser()
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            message: 'ok',
            zpData: {
              applyStatus: 0,
              baseInfo: {
                gender: undefined,
                nickName: 'Alice',
              },
            },
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const resumeText = await user.getUserResumeString({})

    expect(resumeText).toContain('性别: 未知')
  })

  it('reads bst from the page cookie helper and surfaces fetch failures', async () => {
    const user = useUser()
    Object.defineProperty(window, 'Cookie', {
      configurable: true,
      value: {
        get: vi.fn((name: string) => (name === 'bst' ? 'page-token' : '')),
      },
    })

    const fetchMock = vi.fn(async () => {
      throw new Error('network down')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(user.getUserResumeData(true)).rejects.toThrow('network down')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/resume/geek/preview/data.json'),
      expect.objectContaining({
        headers: {
          Zp_token: 'page-token',
        },
      }),
    )
    expect(ElMessage.error).toHaveBeenCalledWith('获取简历数据失败: network down')
  })

  it('falls back to document cookies, caches resume responses, and initializes through getRootVue', async () => {
    const user = useUser()
    Object.defineProperty(window, 'Cookie', {
      configurable: true,
      value: undefined,
    })
    document.cookie = 'bst=document-token; path=/'

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            message: 'ok',
            zpData: {
              applyStatus: 1,
              baseInfo: {
                degreeCategory: '本科',
                gender: 1,
                nickName: 'Alice',
                workYearDesc: '3年',
              },
              certificationList: [{ certName: 'PMP' }],
              educationExpList: [
                { degreeName: '本科', endYear: '2020', school: 'U', startYear: '2016' },
              ],
              expectList: [{ positionName: '前端工程师', positionType: 0, salaryDesc: '20-30K' }],
              projectExpList: [
                {
                  endDate: '2024.02',
                  name: 'Portal',
                  performance: '上线',
                  roleName: '负责人',
                  startDate: '2024.01',
                },
              ],
              userDesc: '个人优势',
              volunteerExpList: [
                { name: '社区服务', serviceLength: '20h', volunteerDescription: '帮助社区' },
              ],
              workExpList: [
                {
                  companyName: 'Acme',
                  endDate: '2024.03',
                  positionName: '前端',
                  startDate: '2023.01',
                  workContent: '开发页面',
                  workPerformance: '性能优化',
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = await user.getUserResumeData(false)
    const second = await user.getUserResumeData(false)
    const resumeText = await user.getUserResumeString({})

    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/resume/geek/preview/data.json'),
      expect.objectContaining({ headers: { Zp_token: 'document-token' } }),
    )
    expect(resumeText).toContain('期望职位')
    expect(resumeText).toContain('个人优势')
    expect(resumeText).toContain('教育经历')
    expect(resumeText).toContain('资格证书')
    expect(resumeText).toContain('志愿者经历')

    const rootState = reactive<{ userInfo?: Record<string, unknown> }>({
      userInfo: {
        showName: 'Boss Helper',
        userId: 10,
      },
    })
    getRootVueMock.mockResolvedValue({
      $store: {
        state: rootState,
      },
    })
    await expect(user.initUser()).resolves.toEqual(expect.objectContaining({ userId: 10 }))
  })

  it('saves, switches, deletes, clears, and initializes cookie snapshots', async () => {
    const user = useUser()
    const conf = useConf()
    user.info.value = {
      gender: 0,
      largeAvatar: 'large.png',
      name: 'Boss Helper',
      showName: 'Boss Helper',
      studentFlag: true,
      tinyAvatar: 'tiny.png',
      userId: 12,
    } as any
    conf.formData.deliveryLimit.value = 4

    const saved = await user.saveUser({ uid: null })
    expect(saved.uid).toBe('12')
    expect(saved.flag).toBe('student')

    await counter.cookieSave({
      ...saved,
      uid: '99',
      statistics: JSON.stringify({ t: { date: '2026-04-10', success: 1, total: 2 }, s: [] }),
      form: {
        amap: { key: 'secret' },
        deliveryLimit: { value: 6 },
      },
    } as never)

    const setStatisticsSpy = vi.spyOn(await import('@/stores/statistics'), 'useStatistics')
    const statsStore = setStatisticsSpy()
    const setStatisticsMock = vi.spyOn(statsStore, 'setStatistics')

    await user.changeUser({
      ...saved,
      uid: '99',
      statistics: JSON.stringify({ t: { date: '2026-04-10', success: 1, total: 2 }, s: [] }),
      form: {
        amap: { key: 'secret' },
        deliveryLimit: { value: 6 },
      },
    } as never)
    expect(setStatisticsMock).toHaveBeenCalledTimes(1)
    expect(await counter.storageGet(formDataKey, {})).toEqual(
      expect.objectContaining({
        deliveryLimit: expect.objectContaining({ value: 6 }),
        notification: expect.objectContaining({ value: defaultFormData.notification.value }),
      }),
    )

    await expect(user.changeUser()).resolves.toBeUndefined()
    expect(ElMessage.error).toHaveBeenCalledWith('请先选择要切换的账号')

    await user.initCookie()
    expect(user.cookieTableData.value.some((item) => item.uid === '99')).toBe(true)

    await user.deleteUser({ uid: '99' } as never)
    expect(user.cookieDatas.value['99']).toBeUndefined()

    vi.spyOn(counter, 'cookieDelete').mockRejectedValueOnce(new Error('delete failed'))
    await user.deleteUser({ uid: '404' } as never)
    expect(ElMessage.error).toHaveBeenCalledWith('删除账号失败，请重试')

    await user.clearUser()
    expect(await counter.cookieInfo()).toEqual({})
  })

  it('handles root-vue failures, wait timeouts, and missing uid errors', async () => {
    const user = useUser()

    getRootVueMock.mockResolvedValue(null)
    await expect(user.initUser()).resolves.toBeNull()

    await expect(user.saveUser({ uid: null })).rejects.toThrow('找不到uid')

    vi.useFakeTimers()
    const rootState = reactive<{ userInfo?: Record<string, unknown> }>({})
    const timeoutPromise = waitForRootUserInfo(rootState as never)
    const timeoutError = timeoutPromise.catch((error) => error)
    await vi.advanceTimersByTimeAsync(25_000)
    expect(await timeoutError).toBeNull()
    vi.useRealTimers()
  })
})
