// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockJobList, mockLogStore } = vi.hoisted(() => {
  const entries: Array<Record<string, unknown>> = []

  const mockLogStore = {
    add(job: { jobName?: string }, err: { message?: string; name?: string; state?: string } | null, logdata?: Record<string, unknown>, msg?: string) {
      entries.push({
        createdAt: new Date().toISOString(),
        job,
        runId: typeof logdata?.runId === 'string' && logdata.runId ? logdata.runId : null,
        title: job.jobName ?? '',
        state: err?.state ?? 'success',
        state_name: err?.name ?? '投递成功',
        message: msg ?? err?.message,
        data: logdata,
      })
    },
    clear() {
      entries.length = 0
    },
    query(options: { limit?: number; offset?: number } = {}) {
      const limit = Number.isInteger(options.limit) && (options.limit ?? 0) > 0 ? options.limit! : 50
      const offset = Number.isInteger(options.offset) && (options.offset ?? 0) >= 0 ? options.offset! : 0
      const ordered = [...entries].reverse()
      return {
        items: ordered.slice(offset, offset + limit),
        limit,
        offset,
        total: ordered.length,
      }
    },
  }

  const mockJobList = {
    list: [] as Array<Record<string, unknown>>,
    map: {} as Record<string, Record<string, unknown>>,
    clear() {
      this.list = []
      Object.keys(this.map).forEach((key) => {
        delete this.map[key]
      })
    },
    get(encryptJobId: string) {
      return this.map[encryptJobId]
    },
    set(encryptJobId: string, val: Record<string, unknown>) {
      this.map[encryptJobId] = val
    },
    replace(nextList: Array<Record<string, unknown>>) {
      this.list = [...nextList]
    },
  }

  return { mockJobList, mockLogStore }
})

vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
  },
}))

vi.mock('@/stores/jobs', () => ({
  jobList: mockJobList,
}))

vi.mock('@/stores/log', () => ({
  useLog: () => mockLogStore,
}))

vi.mock('@/pages/zhipin/hooks/agentReview', () => ({
  getExternalAIFilterReviewSnapshot: vi.fn(() => null),
  submitExternalAIFilterReview: vi.fn(() => true),
}))

import type { UseAgentQueriesOptions } from '@/pages/zhipin/hooks/agentQueryShared'
import { useAgentJobQueries } from '@/pages/zhipin/hooks/useAgentJobQueries'
import { jobList, type MyJobListData } from '@/stores/jobs'
import { useLog } from '@/stores/log'
import { AIFilteringError } from '@/types/deliverError'

function createQueryOptions(overrides: Partial<UseAgentQueriesOptions> = {}): UseAgentQueriesOptions {
  return {
    currentProgressSnapshot: () => ({}),
    ensureStoresLoaded: async () => {},
    ensureSupportedPage: () => true,
    fail: async (code, message) => ({ ok: false, code, message }),
    ok: async (code, message) => ({ ok: true, code, message }),
    ...overrides,
  }
}

function createJob(overrides: Partial<MyJobListData> = {}): MyJobListData {
  const job = {
    encryptJobId: 'job-1',
    jobName: 'Frontend Engineer',
    brandName: 'Acme',
    brandScaleName: '100-499人',
    salaryDesc: '20-30K',
    cityName: '上海',
    areaDistrict: '浦东',
    skills: ['Vue', 'TypeScript'],
    jobLabels: ['双休'],
    bossName: 'Alice',
    bossTitle: 'HRD',
    goldHunter: 0,
    contact: true,
    welfareList: ['五险一金'],
    brandIndustry: '互联网',
    jobDegree: '本科',
    jobExperience: '3-5年',
    gps: null,
    card: undefined,
    status: {
      status: 'wait',
      msg: '等待中',
      setStatus(status: MyJobListData['status']['status'], msg = '') {
        job.status.status = status
        job.status.msg = msg
      },
    },
    getCard: async () => {
      throw new Error('not implemented')
    },
    ...overrides,
  } as MyJobListData

  return job
}

describe('useAgentJobQueries', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/web/geek/job')
    document.title = 'Boss Jobs'
    document.body.innerHTML = `
      <div id="wrap">
        <div class="job-search-wrapper"></div>
        <div class="page-job-wrapper"></div>
      </div>
      <div id="boss-helper"></div>
      <div id="boss-helper-job"></div>
    `
    jobList.clear()
    useLog().clear()
  })

  it('filters jobs.list by pipeline status', async () => {
    const waitJob = createJob({ encryptJobId: 'job-wait' })
    const successJob = createJob({
      encryptJobId: 'job-success',
      status: {
        status: 'success',
        msg: '投递成功',
        setStatus(status, msg = '') {
          successJob.status.status = status
          successJob.status.msg = msg
        },
      },
    })

    jobList.replace([waitJob, successJob])
    jobList.set(waitJob.encryptJobId, waitJob)
    jobList.set(successJob.encryptJobId, successJob)

    const queries = useAgentJobQueries(createQueryOptions())
    const response = await queries.jobsList({ statusFilter: ['success'] })

    expect(response.ok).toBe(true)
    expect(response.code).toBe('jobs-list')
    expect(response.data?.total).toBe(1)
    expect(response.data?.totalOnPage).toBe(2)
    expect(response.data?.jobs.map((item) => item.encryptJobId)).toEqual(['job-success'])
  })

  it('accepts jobs.refresh on supported pages and keeps unsupported-page guard', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation(
      ((..._args: Parameters<typeof window.setTimeout>) => 1) as unknown as typeof window.setTimeout,
    )

    const queries = useAgentJobQueries(createQueryOptions())
    await expect(queries.jobsRefresh()).resolves.toEqual(
      expect.objectContaining({
        code: 'jobs-refresh-accepted',
        ok: true,
        data: {
          targetUrl: window.location.href,
        },
      }),
    )
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 50)

    const unsupportedQueries = useAgentJobQueries(
      createQueryOptions({
        ensureSupportedPage: () => false,
      }),
    )
    await expect(unsupportedQueries.jobsRefresh()).resolves.toEqual(
      expect.objectContaining({
        code: 'unsupported-page',
        ok: false,
        retryable: true,
        suggestedAction: 'navigate',
      }),
    )

    setTimeoutSpy.mockRestore()
  })

  it('loads missing card data in jobs.detail and maps detail fields', async () => {
    const job = createJob({ encryptJobId: 'job-detail' })
    job.getCard = async () => {
      job.card = {
        postDescription: '负责页面开发',
        salaryDesc: '30-40K',
        degreeName: '本科',
        experienceName: '5-10年',
        address: '张江高科',
        jobLabels: ['React', '架构'],
        bossName: 'Bob',
        bossTitle: '招聘经理',
        activeTimeDesc: '刚刚活跃',
        friendStatus: 1,
        brandName: 'Detail Corp',
        brandComInfo: { brandName: 'Detail Corp', industryName: '软件服务' },
        jobInfo: {
          postDescription: '负责页面开发',
          salaryDesc: '30-40K',
          degreeName: '本科',
          experienceName: '5-10年',
          address: '张江高科',
          showSkills: ['React', '架构'],
          longitude: 121.6,
          latitude: 31.2,
        },
        bossInfo: {
          name: 'Bob',
          title: '招聘经理',
          activeTimeDesc: '刚刚活跃',
        },
        relationInfo: {
          beFriend: true,
        },
      } as NonNullable<MyJobListData['card']>
      return job.card
    }

    jobList.replace([job])
    jobList.set(job.encryptJobId, job)

    const queries = useAgentJobQueries(createQueryOptions())
    const response = await queries.jobsDetail({ encryptJobId: 'job-detail' })

    expect(response.ok).toBe(true)
    expect(response.code).toBe('job-detail')
    expect(response.data?.job.postDescription).toBe('负责页面开发')
    expect(response.data?.job.salaryDesc).toBe('30-40K')
    expect(response.data?.job.brandName).toBe('Detail Corp')
    expect(response.data?.job.friendStatus).toBe(1)
    expect(response.data?.job.gps).toEqual({ longitude: 121.6, latitude: 31.2 })
    expect(response.data?.job.hasCard).toBe(true)
  })

  it('returns normalized logs from logs.query in reverse chronological order', async () => {
    const olderJob = createJob({ encryptJobId: 'job-old', jobName: 'Old Job' })
    const newerJob = createJob({ encryptJobId: 'job-new', jobName: 'New Job' })
    const log = useLog()

    log.add(olderJob, null, { listData: olderJob, aiGreetingA: '你好' }, 'older message')
    log.add(
      newerJob,
      null,
      {
        listData: newerJob,
        aiFilteringAjson: { score: 92 },
        pipelineError: {
          errorMessage: 'step failed',
          errorName: 'PipelineError',
          jobId: newerJob.encryptJobId,
          stage: 'after',
          step: 'filtering',
        },
      },
      'newer message',
    )

    const queries = useAgentJobQueries(createQueryOptions())
    const response = await queries.logsQuery({ limit: 10, offset: 0 })

    expect(response.ok).toBe(true)
    expect(response.code).toBe('logs-query')
    expect(response.data?.total).toBe(2)
    expect(response.data?.items[0]?.encryptJobId).toBe('job-new')
    expect(response.data?.items[0]?.aiScore).toEqual({ score: 92 })
    expect(response.data?.items[0]?.pipelineError).toEqual({
      errorMessage: 'step failed',
      errorName: 'PipelineError',
      jobId: 'job-new',
      stage: 'after',
      step: 'filtering',
    })
    expect(response.data?.items[0]?.runId).toBeNull()
    expect(response.data?.items[0]?.audit).toEqual({
      category: 'execution',
      outcome: 'delivered',
      reasonCode: 'delivery-succeeded',
    })
    expect(response.data?.items[1]?.encryptJobId).toBe('job-old')
    expect(response.data?.items[1]?.greeting).toBe('你好')
  })

  it('surfaces structured audit fields in logs.query for stable reason codes', async () => {
    const job = createJob({ encryptJobId: 'job-audit', jobName: 'Audit Job' })
    const log = useLog()

    log.add(job, new AIFilteringError('没有找到AI筛选的模型'), {
      listData: job,
      pipelineError: {
        errorMessage: '没有找到AI筛选的模型',
        errorName: 'AI筛选',
        jobId: job.encryptJobId,
        stage: 'before',
        step: 'aiFiltering',
      },
    })

    const queries = useAgentJobQueries(createQueryOptions())
    const response = await queries.logsQuery({ limit: 10, offset: 0 })

    expect(response.ok).toBe(true)
    expect(response.data?.items[0]?.runId).toBeNull()
    expect(response.data?.items[0]?.audit).toEqual({
      category: 'config',
      outcome: 'skipped',
      reasonCode: 'ai-filtering-model-missing',
    })
  })

  it('surfaces runId from page-side log entries when available', async () => {
    const job = createJob({ encryptJobId: 'job-run-log', jobName: 'Run Log Job' })
    const log = useLog()

    log.add(job, null, {
      listData: job,
      runId: 'run-from-log-entry',
    }, 'delivered')

    const queries = useAgentJobQueries(createQueryOptions())
    const response = await queries.logsQuery({ limit: 10, offset: 0 })

    expect(response.ok).toBe(true)
    expect(response.data?.items[0]?.runId).toBe('run-from-log-entry')
  })

  it('surfaces review snapshot from page-side review state when available', async () => {
    const { getExternalAIFilterReviewSnapshot } = await import('@/pages/zhipin/hooks/agentReview')
    vi.mocked(getExternalAIFilterReviewSnapshot).mockReturnValueOnce({
      reasonCode: 'external-review-pending',
      source: 'external-ai-review',
      reason: 'waiting review',
      status: 'pending',
      timeoutMs: 1000,
      updatedAt: '2026-04-14T00:00:00.000Z',
    })

    const job = createJob({ encryptJobId: 'job-review-state', jobName: 'Review State Job' })
    const log = useLog()
    log.add(job, null, { listData: job }, 'review pending')

    const queries = useAgentJobQueries(createQueryOptions())
    const response = await queries.logsQuery({ limit: 10, offset: 0 })

    expect(response.ok).toBe(true)
    expect(response.data?.items[0]?.review).toEqual({
      reasonCode: 'external-review-pending',
      source: 'external-ai-review',
      reason: 'waiting review',
      status: 'pending',
      timeoutMs: 1000,
      updatedAt: '2026-04-14T00:00:00.000Z',
    })
  })

  it('upgrades stored pending review metadata when live snapshot reaches a final state', async () => {
    const { getExternalAIFilterReviewSnapshot } = await import('@/pages/zhipin/hooks/agentReview')
    vi.mocked(getExternalAIFilterReviewSnapshot).mockReturnValueOnce({
      finalDecisionAt: '2026-04-14T00:01:00.000Z',
      handledBy: 'system',
      queueDepth: 2,
      reason: '外部审核超时',
      reasonCode: 'external-review-timeout',
      replacementRunId: null,
      status: 'rejected',
      source: 'external-ai-review',
      timeoutMs: 1000,
      timeoutSource: 'request-timeout',
      updatedAt: '2026-04-14T00:01:00.000Z',
    })

    const job = createJob({ encryptJobId: 'job-review-final', jobName: 'Review Final Job' })
    const log = useLog()
    log.add(job, null, {
      listData: job,
      review: {
        queueDepth: 1,
        reason: '等待审核中',
        reasonCode: 'external-review-pending',
        status: 'pending',
        source: 'external-ai-review',
        timeoutMs: 1000,
        updatedAt: '2026-04-14T00:00:00.000Z',
      },
    }, 'waiting review')

    const queries = useAgentJobQueries(createQueryOptions())
    const response = await queries.logsQuery({ limit: 10, offset: 0 })

    expect(response.ok).toBe(true)
    expect(response.data?.items[0]?.review).toEqual({
      finalDecisionAt: '2026-04-14T00:01:00.000Z',
      handledBy: 'system',
      queueDepth: 2,
      reason: '外部审核超时',
      reasonCode: 'external-review-timeout',
      replacementRunId: null,
      status: 'rejected',
      source: 'external-ai-review',
      timeoutMs: 1000,
      timeoutSource: 'request-timeout',
      updatedAt: '2026-04-14T00:01:00.000Z',
    })
  })

  it('adds structured recovery hints when jobs.detail cannot load card data', async () => {
    const job = createJob({
      encryptJobId: 'job-fail',
      getCard: async () => {
        throw new Error('card missing')
      },
    })

    jobList.replace([job])
    jobList.set(job.encryptJobId, job)

    const queries = useAgentJobQueries(createQueryOptions())
    const response = await queries.jobsDetail({ encryptJobId: 'job-fail' })

    expect(response).toEqual(
      expect.objectContaining({
        code: 'job-detail-load-failed',
        message: 'card missing',
        ok: false,
        retryable: true,
        suggestedAction: 'retry',
      }),
    )
  })
})
