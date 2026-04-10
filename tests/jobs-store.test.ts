// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { checkJobCacheMock, getActiveSiteAdapterMock, loggerMock } = vi.hoisted(() => ({
  checkJobCacheMock: vi.fn(() => null),
  getActiveSiteAdapterMock: vi.fn(() => ({
    getVueBindings: vi.fn(() => ({
      clickJobCardActionKey: 'clickJobCardAction',
      jobDetailKey: 'jobDetail',
      jobListKey: 'jobList',
    })),
    parseJobList: vi.fn((items: bossZpJobItemData[]) => items),
  })),
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/composables/useApplying', () => ({
  checkJobCache: checkJobCacheMock,
}))

vi.mock('@/composables/useVue', () => ({
  useHookVueData: vi.fn(),
  useHookVueFn: vi.fn(),
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

describe('JobList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
