// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { FormData } from '@/types/formData'
import type { PipelineCacheItem } from '@/types/pipelineCache'

import { setupPinia } from './helpers/pinia'

const {
  checkJobCacheMock,
  getActiveSiteAdapterMock,
  getReadyCacheManagerMock,
  loggerMock,
  parseJobListMock,
  useHookVueDataMock,
  useHookVueFnMock,
} = vi.hoisted(() => ({
  checkJobCacheMock: vi.fn(() => null),
  getActiveSiteAdapterMock: vi.fn(),
  getReadyCacheManagerMock: vi.fn(async () => undefined),
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
  parseJobListMock: vi.fn((items: bossZpJobItemData[]) => items),
  useHookVueDataMock: vi.fn(),
  useHookVueFnMock: vi.fn(),
}))

vi.mock('@/composables/useApplying', () => ({
  checkJobCache: checkJobCacheMock,
  getReadyCacheManager: getReadyCacheManagerMock,
}))

vi.mock('@/composables/useVue', () => ({
  useHookVueData: useHookVueDataMock,
  useHookVueFn: useHookVueFnMock,
}))

vi.mock('@/site-adapters', () => ({
  getActiveSiteAdapter: getActiveSiteAdapterMock,
}))

vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}))

import { useJobs, waitForJobDetail } from '@/stores/jobs'

function createJobItem(overrides: Partial<bossZpJobItemData> = {}): bossZpJobItemData {
  return {
    encryptJobId: 'job-1',
    lid: 'lid-1',
    ...overrides,
  } as bossZpJobItemData
}

function createListItem(overrides: Partial<Record<string, unknown>> = {}) {
  const job = {
    encryptJobId: 'job-1',
    getCard: vi.fn(),
    lid: 'lid-1',
    status: {
      msg: '未开始',
      setStatus(status: string, msg = '') {
        job.status.status = status
        job.status.msg = msg
      },
      status: 'pending',
    },
    ...overrides,
  }

  return job
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('jobs store', () => {
  beforeEach(() => {
    setupPinia()
    vi.clearAllMocks()
    parseJobListMock.mockImplementation((items: bossZpJobItemData[]) => items)
    getActiveSiteAdapterMock.mockReturnValue({
      getVueBindings: vi.fn(() => ({
        clickJobCardActionKey: 'clickJobCardAction',
        jobDetailKey: 'jobDetail',
        jobListKey: 'jobList',
      })),
      parseJobDetail: vi.fn((detail: bossZpDetailData) => ({
        ...detail,
        activeTimeDesc: detail.bossInfo?.activeTimeDesc ?? '',
        address: detail.jobInfo?.address ?? '',
        bossName: detail.bossInfo?.name ?? '',
        bossTitle: detail.bossInfo?.title ?? '',
        brandName: detail.brandComInfo?.brandName ?? '',
        cityName: detail.jobInfo?.locationName ?? '',
        degreeName: detail.jobInfo?.degreeName ?? '',
        encryptJobId: detail.jobInfo?.encryptId ?? '',
        encryptUserId: detail.jobInfo?.encryptUserId ?? '',
        experienceName: detail.jobInfo?.experienceName ?? '',
        friendStatus: detail.relationInfo?.beFriend ? 1 : 0,
        jobInfo: detail.jobInfo,
        jobLabels: detail.jobInfo?.showSkills ?? [],
        jobName: detail.jobInfo?.jobName ?? '',
        postDescription: detail.jobInfo?.postDescription ?? '',
        salaryDesc: detail.jobInfo?.salaryDesc ?? '',
        securityId: detail.securityId ?? '',
        sessionId: detail.sessionId ?? '',
      })),
      parseJobList: parseJobListMock,
    })
    getReadyCacheManagerMock.mockResolvedValue(undefined)
    useHookVueDataMock.mockImplementation(() => async () => {})
    useHookVueFnMock.mockImplementation(() => async () => async () => {})
    useJobs().clear()
  })

  it('returns entries from the derived map getter', () => {
    const jobs = useJobs()
    const job = createListItem()

    jobs.set(job.encryptJobId, job as never)

    expect(jobs.map.value[job.encryptJobId]).toMatchObject({
      encryptJobId: job.encryptJobId,
      lid: job.lid,
    })
  })

  it('tracks the currently selected job detail snapshot from vue state', async () => {
    const jobs = useJobs()
    const detail = {
      lid: 'lid-1',
      jobInfo: {
        encryptId: 'job-1',
        encryptUserId: 'user-1',
        postDescription: '当前详情',
        salaryDesc: '20-30K',
        degreeName: '本科',
        experienceName: '3-5年',
        address: '张江高科',
        showSkills: ['Vue'],
        longitude: 121.6,
        latitude: 31.2,
        proxyJob: 0,
        jobName: 'Frontend Engineer',
        locationName: '上海',
      },
      bossInfo: {
        activeTimeDesc: '刚刚活跃',
        bossOnline: true,
        brandName: 'Acme',
        certificated: true,
        large: 'https://example.com/avatar-large.png',
        name: 'Alice',
        tiny: 'https://example.com/avatar-small.png',
        title: 'HR',
      },
      brandComInfo: {
        brandName: 'Acme',
        industryName: '互联网',
      },
      relationInfo: {
        beFriend: false,
        interestJob: false,
      },
      securityId: 'security-1',
      sessionId: 'session-1',
    } as bossZpDetailData
    const parsed = createListItem({ encryptJobId: 'job-1' }) as any

    parseJobListMock.mockImplementation(((_items: bossZpJobItemData[], options?: any) => [
      {
        ...parsed,
        status: options.createStatus('job-1', null),
      },
    ]) as any)
    useHookVueDataMock
      .mockImplementationOnce(
        (_selectors: unknown, _key: unknown, data: { value: unknown }, update?: (val: unknown) => void) =>
          async () => {
            data.value = detail as never
            update?.(data.value)
          },
      )
      .mockImplementationOnce(
        (_selectors: unknown, _key: unknown, data: { value: unknown }, update?: (val: unknown) => void) =>
          async () => {
            data.value = [createJobItem({ encryptJobId: 'job-1', lid: 'lid-1' })] as never
            update?.(data.value)
          },
      )

    await jobs.initJobList({
      useCache: {
        value: false,
      },
    } as FormData)

    expect(jobs.getSelected()).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({ encryptJobId: 'job-1' }),
        card: expect.objectContaining({
          encryptJobId: 'job-1',
          postDescription: '当前详情',
        }),
      }),
    )
    expect(jobs.get('job-1')?.card).toEqual(
      expect.objectContaining({
        encryptJobId: 'job-1',
        postDescription: '当前详情',
      }),
    )
  })

  it('waits for matching detail updates without interval polling', async () => {
    const item = createJobItem()
    const detail = { lid: item.lid } as bossZpDetailData
    const jobDetail = ref<bossZpDetailData>()
    const clickJobCardAction = vi.fn(async () => {})
    const setIntervalSpy = vi.spyOn(window, 'setInterval')

    const detailPromise = waitForJobDetail({
      clickJobCardAction,
      item,
      jobDetail,
    })
    await Promise.resolve()
    jobDetail.value = detail

    await expect(detailPromise).resolves.toMatchObject({ lid: detail.lid })
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('resolves immediately when click action already loaded the matching detail', async () => {
    const item = createJobItem()
    const detail = { lid: item.lid } as bossZpDetailData
    const jobDetail = ref<bossZpDetailData>()
    const clickJobCardAction = vi.fn(async () => {
      jobDetail.value = detail
    })

    await expect(
      waitForJobDetail({
        clickJobCardAction,
        item,
        jobDetail,
      }),
    ).resolves.toMatchObject({ lid: detail.lid })
    expect(clickJobCardAction).toHaveBeenCalledWith(item)
  })

  it('waits for the cache manager to finish loading before hydrating the job list', async () => {
    const jobs = useJobs()
    const ready = createDeferred<void>()

    getReadyCacheManagerMock.mockImplementation(async () => {
      await ready.promise
      return undefined
    })
    useHookVueDataMock
      .mockImplementationOnce(() => async () => {})
      .mockImplementationOnce(
        (_selectors: unknown, _key: unknown, data: { value: unknown }, update?: (val: unknown) => void) =>
          async () => {
            data.value = [createJobItem()] as never
            update?.(data.value)
          },
      )

    const initPromise = jobs.initJobList({
      useCache: {
        value: true,
      },
    } as FormData)

    await flushMicrotasks()

    expect(getReadyCacheManagerMock).toHaveBeenCalledTimes(1)
    expect(useHookVueDataMock).not.toHaveBeenCalled()
    expect(parseJobListMock).not.toHaveBeenCalled()

    ready.resolve()
    await initPromise

    expect(useHookVueDataMock).toHaveBeenCalledTimes(2)
    expect(parseJobListMock).toHaveBeenCalledTimes(1)
  })

  it('syncs parsed jobs with cache results and loaded cards', () => {
    const jobs = useJobs()
    const existing = createListItem() as ReturnType<typeof createListItem> & { card?: bossZpCardData }
    const loadedCard = { postDescription: 'cached card' } as unknown as bossZpCardData
    let createStatus!: (
      encryptJobId: string,
      cacheCheck: Pick<PipelineCacheItem, 'message' | 'status'> | null,
    ) => {
      msg: string
      setStatus: (status: 'pending' | 'wait' | 'running' | 'success' | 'error' | 'warn', msg?: string) => void
      status: 'pending' | 'wait' | 'running' | 'success' | 'error' | 'warn'
    }

    const cachedResult = {
      brandName: 'Acme',
      createdAt: 1,
      encryptJobId: 'job-1',
      expireAt: 2,
      hitCount: 0,
      jobName: 'Frontend Engineer',
      lastAccessed: 1,
      message: '已投递',
      processorType: 'basic' as const,
      status: 'success' as const,
    } satisfies PipelineCacheItem

    jobs.replace([existing as never])
    ;(checkJobCacheMock as unknown as { mockReturnValue(value: PipelineCacheItem): void }).mockReturnValue(cachedResult)
    parseJobListMock.mockImplementation(((items: bossZpJobItemData[], options?: any) => {
      expect(items).toEqual([createJobItem()])
      expect(options.currentJobs).toEqual([existing])
      expect(options.getCachedResult('job-1')).toEqual(cachedResult)
      options.onCardLoaded('job-1', loadedCard)
      options.onCardLoaded('missing', { ignored: true } as unknown as bossZpCardData)
      createStatus = options.createStatus

      return [
        createListItem({
          status: options.createStatus('job-1', options.getCachedResult('job-1')),
        }),
      ]
    }) as any)

    jobs.syncJobList([createJobItem()])

    expect(existing.card).toBe(loadedCard)
    expect(checkJobCacheMock).toHaveBeenCalledWith('job-1')
    expect(jobs.list.value[0].status).toMatchObject({
      msg: '已投递 (缓存)',
      status: 'success',
    })

    jobs.list.value[0].status.setStatus('warn', '需要复查')
    expect(jobs.get('job-1')?.status).toMatchObject({
      msg: '需要复查',
      status: 'warn',
    })

    const missingStatus = createStatus('missing', null)
    expect(() => missingStatus.setStatus('error', 'ignored')).not.toThrow()
    expect(jobs.get('missing')).toBeUndefined()

    jobs.set('job-1', createListItem({ lid: 'updated-lid' }) as never)
    expect(jobs.get('job-1')?.lid).toBe('updated-lid')

    jobs.clear()
    expect(jobs.list.value).toEqual([])
  })

  it('hydrates uncached jobs without waiting for the cache manager when disabled', async () => {
    const jobs = useJobs()

    parseJobListMock.mockImplementation(((_items: bossZpJobItemData[], options?: any) => [
      createListItem({
        status: options.createStatus('job-1', options.getCachedResult('job-1')),
      }),
    ]) as any)
    useHookVueDataMock
      .mockImplementationOnce(() => async () => {})
      .mockImplementationOnce(
        (_selectors: unknown, _key: unknown, data: { value: unknown }, update?: (val: unknown) => void) =>
          async () => {
            data.value = [createJobItem()] as never
            update?.(data.value)
          },
      )

    await jobs.initJobList({
      useCache: {
        value: false,
      },
    } as FormData)

    expect(getReadyCacheManagerMock).not.toHaveBeenCalled()
    expect(checkJobCacheMock).not.toHaveBeenCalled()
    expect(jobs.list.value[0].status).toMatchObject({
      msg: '未开始',
      status: 'pending',
    })
  })

  it('rejects when matching detail never arrives before the timeout', async () => {
    vi.useFakeTimers()

    try {
      const item = createJobItem()
      const jobDetail = ref<bossZpDetailData>()
      const clickJobCardAction = vi.fn(async () => {
        jobDetail.value = { lid: 'other-lid' } as bossZpDetailData
      })

      const detailPromise = waitForJobDetail({
        clickJobCardAction,
        item,
        jobDetail,
      })
      const timeoutAssertion = expect(detailPromise).rejects.toThrow('bossZpDetailData获取超时')

      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(60_000)

      await timeoutAssertion
    } finally {
      vi.useRealTimers()
    }
  })
})
