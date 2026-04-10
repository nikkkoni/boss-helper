// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FormData } from '@/types/formData'

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

import { JobList } from '@/stores/jobs'

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

function getInternalStore(store: JobList) {
  return store as unknown as {
    _vue_jobDetail: { value?: bossZpDetailData }
    clickJobCardAction: (item: bossZpJobItemData) => Promise<void>
    loadJobDetail: (item: bossZpJobItemData) => Promise<bossZpDetailData>
  }
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

describe('JobList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    parseJobListMock.mockImplementation((items: bossZpJobItemData[]) => items)
    getActiveSiteAdapterMock.mockReturnValue({
      getVueBindings: vi.fn(() => ({
        clickJobCardActionKey: 'clickJobCardAction',
        jobDetailKey: 'jobDetail',
        jobListKey: 'jobList',
      })),
      parseJobList: parseJobListMock,
    })
    getReadyCacheManagerMock.mockResolvedValue(undefined)
    useHookVueDataMock.mockImplementation(() => async () => {})
    useHookVueFnMock.mockImplementation(() => async () => async () => {})
  })

  it('returns entries from the reactive map getter', () => {
    const jobs = new JobList()
    const job = createListItem()

    jobs.set(job.encryptJobId, job as never)

    expect(jobs.map[job.encryptJobId]).toMatchObject({
      encryptJobId: job.encryptJobId,
      lid: job.lid,
    })
  })

  it('waits for matching detail updates without interval polling', async () => {
    const jobs = new JobList()
    const internalStore = getInternalStore(jobs)
    const item = createJobItem()
    const detail = { lid: item.lid } as bossZpDetailData
    const setIntervalSpy = vi.spyOn(window, 'setInterval')

    internalStore.clickJobCardAction = vi.fn(async () => {})

    const detailPromise = internalStore.loadJobDetail(item)
    await Promise.resolve()
    internalStore._vue_jobDetail.value = detail

    await expect(detailPromise).resolves.toMatchObject({ lid: detail.lid })
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('resolves immediately when click action already loaded the matching detail', async () => {
    const jobs = new JobList()
    const internalStore = getInternalStore(jobs)
    const item = createJobItem()
    const detail = { lid: item.lid } as bossZpDetailData
    const clickJobCardAction = vi.fn(async () => {
      internalStore._vue_jobDetail.value = detail
    })

    internalStore.clickJobCardAction = clickJobCardAction

    await expect(internalStore.loadJobDetail(item)).resolves.toMatchObject({ lid: detail.lid })
    expect(clickJobCardAction).toHaveBeenCalledWith(item)
  })

  it('waits for the cache manager to finish loading before hydrating the job list', async () => {
    const jobs = new JobList()
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
})
