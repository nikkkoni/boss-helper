import { describe, expect, it } from 'vitest'

import {
  createDailyStatisticsSnapshot,
  resetJobStatuses,
  toAgentCurrentJob,
  toAgentJobDetail,
  toAgentJobSummary,
  toPendingReviewDetail,
} from '@/pages/zhipin/shared/jobMapping'

import { createJob, createJobCard, createLogContext } from './helpers/jobs'

describe('jobMapping', () => {
  it('creates empty daily statistics snapshots', () => {
    expect(createDailyStatisticsSnapshot('2026-04-11')).toEqual({
      date: '2026-04-11',
      success: 0,
      total: 0,
      company: 0,
      jobTitle: 0,
      jobContent: 0,
      aiFiltering: 0,
      hrPosition: 0,
      salaryRange: 0,
      companySizeRange: 0,
      activityFilter: 0,
      goldHunterFilter: 0,
      repeat: 0,
      jobAddress: 0,
      amap: 0,
      aiRequestCount: 0,
      aiInputTokens: 0,
      aiOutputTokens: 0,
      aiTotalTokens: 0,
      aiTotalCost: 0,
    })
  })

  it('maps current jobs from both store objects and plain payloads', () => {
    const job = createJob({
      brandName: 'Acme',
      encryptJobId: 'job-1',
      jobName: 'Frontend',
      status: {
        msg: '处理中',
        setStatus() {},
        status: 'running',
      },
    })

    expect(toAgentCurrentJob(job)).toEqual({
      encryptJobId: 'job-1',
      jobName: 'Frontend',
      brandName: 'Acme',
      status: 'running',
      message: '处理中',
    })

    expect(
      toAgentCurrentJob({
        encryptJobId: 'job-2',
        jobName: null,
        brandName: undefined,
        message: 'plain',
        status: 'wait',
      }),
    ).toEqual({
      encryptJobId: 'job-2',
      jobName: '',
      brandName: '',
      status: 'wait',
      message: 'plain',
    })

    expect(toAgentCurrentJob(null)).toBeNull()
  })

  it('summarizes jobs and expands job details with fallback fields', () => {
    const job = createJob({
      areaDistrict: '浦东',
      bossName: 'Alice',
      bossTitle: 'HR',
      brandIndustry: '互联网',
      brandName: 'Acme',
      brandScaleName: '100-499人',
      cityName: '上海',
      contact: true,
      encryptJobId: 'job-detail',
      goldHunter: 1,
      gps: { latitude: 31.2, longitude: 121.6 },
      jobDegree: '本科',
      jobExperience: '3-5年',
      jobLabels: ['Vue'],
      jobName: 'Frontend',
      salaryDesc: '20-30K',
      skills: ['Vue'],
      welfareList: ['双休'],
      status: {
        msg: '等待中',
        setStatus() {},
        status: 'wait',
      },
    })
    const card = createJobCard({
      address: '',
      bossInfo: {
        ...createJobCard().bossInfo,
        activeTimeDesc: '刚刚活跃',
      },
      brandComInfo: {
        ...createJobCard().brandComInfo,
        brandName: 'Card Corp',
        industryName: '软件服务',
      },
      brandName: '',
      friendStatus: undefined,
      jobInfo: {
        ...createJobCard().jobInfo,
        address: '',
        degreeName: '',
        experienceName: '',
        latitude: undefined as never,
        longitude: undefined as never,
        postDescription: '',
        salaryDesc: '',
        showSkills: [],
      },
      jobLabels: [],
      relationInfo: {
        beFriend: true,
        interestJob: false,
      },
    })

    expect(toAgentJobSummary(job)).toEqual({
      encryptJobId: 'job-detail',
      jobName: 'Frontend',
      brandName: 'Acme',
      brandScaleName: '100-499人',
      salaryDesc: '20-30K',
      cityName: '上海',
      areaDistrict: '浦东',
      skills: ['Vue'],
      jobLabels: ['Vue'],
      bossName: 'Alice',
      bossTitle: 'HR',
      goldHunter: true,
      contact: true,
      welfareList: ['双休'],
      status: 'wait',
      statusMsg: '等待中',
      hasCard: false,
    })

    expect(toAgentJobDetail(job, card)).toEqual(
      expect.objectContaining({
        address: '',
        activeTimeDesc: '刚刚活跃',
        bossName: 'Alice',
        bossTitle: 'HR',
        brandIndustry: '互联网',
        brandName: '',
        degreeName: '本科',
        experienceName: '3-5年',
        friendStatus: 1,
        gps: { latitude: 31.2, longitude: 121.6 },
        hasCard: true,
        jobLabels: [],
        postDescription: '负责前端页面开发',
        salaryDesc: '20-30K',
      }),
    )
  })

  it('builds pending review details and resets only allowed job states', () => {
    const jobA = createJob({ encryptJobId: 'job-a', status: { msg: '未开始', setStatus(status, msg = '') { jobA.status.status = status; jobA.status.msg = msg }, status: 'pending' } })
    const jobB = createJob({ encryptJobId: 'job-b', status: { msg: '已成功', setStatus(status, msg = '') { jobB.status.status = status; jobB.status.msg = msg }, status: 'success' } })
    const jobC = createJob({ encryptJobId: 'job-c', status: { msg: '已警告', setStatus(status, msg = '') { jobC.status.status = status; jobC.status.msg = msg }, status: 'warn' } })
    const jobD = createJob({ encryptJobId: 'job-d', status: { msg: '运行中', setStatus(status, msg = '') { jobD.status.status = status; jobD.status.msg = msg }, status: 'running' } })
    const ctx = createLogContext(createJob({
      brandName: 'Acme',
      card: createJobCard({
        activeTimeDesc: '刚刚活跃',
        address: '张江',
        degreeName: '本科',
        experienceName: '3-5年',
        postDescription: '负责前端页面开发',
      }),
      encryptJobId: 'job-review',
      jobName: 'Frontend',
    }))

    expect(toPendingReviewDetail(ctx, 75, 5_000)).toEqual({
      encryptJobId: 'job-review',
      threshold: 75,
      timeoutMs: 5_000,
      job: expect.objectContaining({
        encryptJobId: 'job-review',
        degreeName: '本科',
        experienceName: '3-5年',
        address: '张江',
        postDescription: '负责前端页面开发',
      }),
    })

    resetJobStatuses([jobA, jobB, jobC, jobD], (job) => job.encryptJobId !== 'job-d')

    expect(jobA.status).toEqual({
      msg: '等待中',
      setStatus: expect.any(Function),
      status: 'wait',
    })
    expect(jobB.status.status).toBe('success')
    expect(jobC.status.status).toBe('warn')
    expect(jobD.status.status).toBe('running')
  })
})
