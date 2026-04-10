// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import { reactive } from 'vue'

const { getRootVueMock } = vi.hoisted(() => ({
  getRootVueMock: vi.fn(),
}))

vi.mock('@/composables/useVue', () => ({
  getRootVue: getRootVueMock,
}))

import { useUser, waitForRootUserInfo } from '@/stores/user'
import { useConf } from '@/stores/conf'
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

  it('keeps literal "undefined" text from resume content while skipping missing fields', async () => {
    const user = useUser()
    const fetchMock = vi.fn(async () =>
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
      ))
    vi.stubGlobal('fetch', fetchMock)

    const resumeText = await user.getUserResumeString({})

    expect(resumeText).toContain('worked on undefined-safe parsing')
    expect(resumeText).toContain('fixed undefined handling')
    expect(resumeText).not.toContain('(undefined)')
    expect(resumeText).not.toContain('undefined-undefined')
  })

  it('includes unknown gender in resume text when the API omits a known value', async () => {
    const user = useUser()
    const fetchMock = vi.fn(async () =>
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
      ))
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
})
