// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLog } from '@/stores/log'

import { createJob } from './helpers/jobs'

describe('log store query', () => {
  beforeEach(() => {
    useLog().clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns reverse-chronological pages without calling Array.reverse', () => {
    const log = useLog()
    const oldJob = createJob({ encryptJobId: 'job-old', jobName: 'Old Job' })
    const midJob = createJob({ encryptJobId: 'job-mid', jobName: 'Mid Job' })
    const newJob = createJob({ encryptJobId: 'job-new', jobName: 'New Job' })

    log.data.value = [
      {
        createdAt: '2026-04-08T00:00:00.000Z',
        job: oldJob,
        message: 'old',
        state: 'info',
        state_name: '消息',
        title: oldJob.jobName,
      },
      {
        createdAt: '2026-04-09T00:00:00.000Z',
        job: midJob,
        message: 'mid',
        state: 'warning',
        state_name: 'AI筛选',
        title: midJob.jobName,
      },
      {
        createdAt: '2026-04-10T00:00:00.000Z',
        job: newJob,
        message: 'new',
        state: 'success',
        state_name: '投递成功',
        title: newJob.jobName,
      },
    ]

    const reverseSpy = vi.spyOn(Array.prototype, 'reverse')
    const result = log.query({ limit: 1, offset: 1 })

    expect(reverseSpy).not.toHaveBeenCalled()
    expect(result.total).toBe(3)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.job?.encryptJobId).toBe('job-mid')
  })

  it('supports state and date filtering while preserving newest-first order', () => {
    const log = useLog()
    const oldJob = createJob({ encryptJobId: 'job-old', jobName: 'Old Job' })
    const midJob = createJob({ encryptJobId: 'job-mid', jobName: 'Mid Job' })
    const newJob = createJob({ encryptJobId: 'job-new', jobName: 'New Job' })

    log.data.value = [
      {
        createdAt: '2026-04-08T00:00:00.000Z',
        job: oldJob,
        message: 'old',
        state: 'info',
        state_name: '消息',
        title: oldJob.jobName,
      },
      {
        createdAt: '2026-04-09T00:00:00.000Z',
        job: midJob,
        message: 'mid',
        state: 'warning',
        state_name: 'AI筛选',
        title: midJob.jobName,
      },
      {
        createdAt: '2026-04-10T00:00:00.000Z',
        job: newJob,
        message: 'new',
        state: 'success',
        state_name: '投递成功',
        title: newJob.jobName,
      },
    ]

    expect(
      log.query({
        from: '2026-04-09T00:00:00.000Z',
        status: ['warning', 'success'],
        to: '2026-04-10T00:00:00.000Z',
      }),
    ).toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({ job: expect.objectContaining({ encryptJobId: 'job-new' }) }),
        expect.objectContaining({ job: expect.objectContaining({ encryptJobId: 'job-mid' }) }),
      ],
    })

    expect(
      log.query({
        status: ['success'],
      }).items[0]?.job?.encryptJobId,
    ).toBe('job-new')
  })
})
