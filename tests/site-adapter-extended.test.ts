import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createJob, createJobCard } from './helpers/jobs'
import type { PipelineCacheItem } from '@/types/pipelineCache'
import type { JobStatus } from '@/stores/jobs'

const adapterMocks = vi.hoisted(() => ({
  sendPublishReq: vi.fn(async () => true),
}))

vi.mock('@/composables/useApplying/utils', () => ({
  sendPublishReq: adapterMocks.sendPublishReq,
}))

describe('zhipin adapter extended', () => {
  beforeEach(() => {
    adapterMocks.sendPublishReq.mockReset()
    adapterMocks.sendPublishReq.mockResolvedValue(true)
  })

  it('validates urls, maps details, and navigates pages', async () => {
    const { createZhipinAdapter } = await import('@/site-adapters/zhipin/adapter')
    const adapter = createZhipinAdapter()
    const pageChange = vi.fn()

    expect(adapter.matches('https://www.zhipin.com/web/geek/job')).toBe(true)
    expect(adapter.matches('not-a-url')).toBe(false)
    expect(
      adapter.buildNavigateUrl(
        { query: '', city: '', position: '', page: 1 },
        'https://www.zhipin.com/web/geek/jobs?query=java&city=101&page=3&position=1001',
        'https://www.zhipin.com',
      ),
    ).toBe('https://www.zhipin.com/web/geek/jobs')
    expect(() =>
      adapter.buildNavigateUrl(
        { url: 'javascript:alert(1)' },
        'https://www.zhipin.com/web/geek/jobs',
        'https://www.zhipin.com',
      ),
    ).toThrow('navigate.url 协议不合法')
    expect(() =>
      adapter.buildNavigateUrl(
        { url: 'https://evil.example/web/geek/jobs' },
        'https://www.zhipin.com/web/geek/jobs',
        'https://www.zhipin.com',
      ),
    ).toThrow('navigate.url 必须与当前站点同源')
    expect(() =>
      adapter.buildNavigateUrl(
        { page: 0 },
        'https://www.zhipin.com/web/geek/jobs',
        'https://www.zhipin.com',
      ),
    ).toThrow('navigate.page 必须是大于等于 1 的整数')

    const detailCard = adapter.parseJobDetail({
      ...createJobCard(),
      jobInfo: {
        ...createJobCard().jobInfo,
        encryptId: 'job-1',
        proxyJob: 1,
      },
      relationInfo: {
        beFriend: false,
        interestJob: true,
      },
    } as never)

    expect(detailCard).toEqual(
      expect.objectContaining({
        atsDirectPost: false,
        atsProxyJob: true,
        encryptJobId: 'job-1',
        friendStatus: 0,
        isInterested: 1,
        canAddFriend: true,
      }),
    )

    expect(adapter.navigatePage({ direction: 'prev', page: { page: 1, pageSize: 15 }, pageChange })).toBe(false)
    expect(adapter.navigatePage({ direction: 'next', page: { page: 2, pageSize: 15 }, pageChange })).toBe(true)
    expect(adapter.navigatePage({ direction: 'prev', page: { page: 2, pageSize: 15 }, pageChange })).toBe(true)
    expect(pageChange).toHaveBeenNthCalledWith(1, 3)
    expect(pageChange).toHaveBeenNthCalledWith(2, 1)

    await expect(adapter.applyToJob({ encryptJobId: 'job-1' } as never)).resolves.toBe(true)
    expect(adapterMocks.sendPublishReq).toHaveBeenCalledWith(expect.objectContaining({ encryptJobId: 'job-1' }))
  })

  it('reuses existing jobs, creates statuses for new jobs, and loads cards through callbacks', async () => {
    const { createZhipinAdapter } = await import('@/site-adapters/zhipin/adapter')
    const adapter = createZhipinAdapter()

    const existing = createJob({
      encryptJobId: 'job-existing',
      jobName: 'Old Name',
      status: {
        msg: '等待中',
        setStatus(status, msg = '') {
          existing.status.status = status
          existing.status.msg = msg
        },
        status: 'wait',
      },
    })
    const cachedResult = {
      brandName: 'New Brand',
      createdAt: 1,
      encryptJobId: 'job-new',
      expireAt: 2,
      hitCount: 0,
      jobName: 'New Job',
      lastAccessed: 1,
      message: 'cached',
      processorType: 'basic' as const,
      status: 'success' as const,
    } satisfies PipelineCacheItem
    const createStatus = vi.fn((encryptJobId: string) => ({
      msg: `status:${encryptJobId}`,
      setStatus: vi.fn(),
      status: 'pending' as JobStatus,
    }))
    const onCardLoaded = vi.fn()
    const loadJobDetail = vi.fn(async () => ({
      ...createJobCard(),
      jobInfo: {
        ...createJobCard().jobInfo,
        encryptId: 'job-new',
      },
      relationInfo: {
        beFriend: true,
        interestJob: false,
      },
    }))

    const items = adapter.parseJobList(
      [
        { ...createJob({ encryptJobId: 'job-existing', jobName: 'Updated Name' }) },
        { ...createJob({ encryptJobId: 'job-new', jobName: 'New Job' }) },
      ] as never,
      {
        currentJobs: [existing],
        getCachedResult: vi.fn((encryptJobId: string) => (encryptJobId === 'job-new' ? cachedResult : null)),
        createStatus,
        loadJobDetail,
        onCardLoaded,
      },
    )

    expect(items[0]).toBe(existing)
    expect(items[0].jobName).toBe('Updated Name')
    expect(createStatus).toHaveBeenCalledWith('job-new', cachedResult)

    const card = await items[1].getCard()
    expect(loadJobDetail).toHaveBeenCalledWith(expect.objectContaining({ encryptJobId: 'job-new' }))
    expect(onCardLoaded).toHaveBeenCalledWith('job-new', card)
    expect(card.encryptJobId).toBe('job-new')
  })
})
