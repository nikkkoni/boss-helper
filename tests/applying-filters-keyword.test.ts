import { describe, expect, it } from 'vitest'

import {
  createCompanyStep,
  createJobContentStep,
  createJobTitleStep,
} from '@/composables/useApplying/services/filters/keyword'
import type { ApplyingStatistics, ToCause } from '@/composables/useApplying/services/filters/shared'
import type { Handler, Step } from '@/composables/useApplying/type'
import { defaultFormData } from '@/stores/conf/info'
import { CompanyNameError, JobDescriptionError, JobTitleError } from '@/types/deliverError'

import { createJob, createJobCard, createLogContext } from './helpers/jobs'

function createStatistics(): ApplyingStatistics {
  return {
    todayData: {
      activityFilter: 0,
      aiFiltering: 0,
      amap: 0,
      company: 0,
      companySizeRange: 0,
      date: '2026-04-11',
      goldHunterFilter: 0,
      hrPosition: 0,
      jobAddress: 0,
      jobContent: 0,
      jobTitle: 0,
      repeat: 0,
      salaryRange: 0,
      success: 0,
      total: 0,
    },
  }
}

function createFormData() {
  return structuredClone(defaultFormData)
}

function getHandler(step: Step | undefined): Handler {
  if (typeof step !== 'function') {
    throw new TypeError('Expected handler step')
  }
  return step
}

const toCause: ToCause = (error) => (error instanceof Error ? { cause: error } : undefined)

describe('keyword filters', () => {
  it('returns undefined when title, company, and content filters are disabled', () => {
    const formData = createFormData()
    const statistics = createStatistics()

    expect(createJobTitleStep(formData, statistics, toCause)()).toBeUndefined()
    expect(createCompanyStep(formData, statistics, toCause)()).toBeUndefined()
    expect(createJobContentStep(formData, statistics, toCause)()).toBeUndefined()
  })

  it('handles title and company include or exclude matching', async () => {
    const job = createJob({
      brandName: 'Acme Tech',
      jobName: 'Senior Frontend Engineer',
    })
    const ctx = createLogContext(job)

    const titleStatistics = createStatistics()
    const titleFormData = createFormData()
    titleFormData.jobTitle.enable = true
    titleFormData.jobTitle.include = false
    titleFormData.jobTitle.value = ['Frontend']

    await expect(
      getHandler(createJobTitleStep(titleFormData, titleStatistics, toCause)())({ data: job }, ctx),
    ).rejects.toBeInstanceOf(JobTitleError)
    expect(titleStatistics.todayData.jobTitle).toBe(1)

    const companyAllowStatistics = createStatistics()
    const companyAllowFormData = createFormData()
    companyAllowFormData.company.enable = true
    companyAllowFormData.company.include = true
    companyAllowFormData.company.value = ['Acme']

    await expect(
      getHandler(createCompanyStep(companyAllowFormData, companyAllowStatistics, toCause)())(
        { data: job },
        ctx,
      ),
    ).resolves.toBeUndefined()
    expect(companyAllowStatistics.todayData.company).toBe(0)

    const companyRejectStatistics = createStatistics()
    const companyRejectFormData = createFormData()
    companyRejectFormData.company.enable = true
    companyRejectFormData.company.include = true
    companyRejectFormData.company.value = ['Globex']

    await expect(
      getHandler(createCompanyStep(companyRejectFormData, companyRejectStatistics, toCause)())(
        { data: job },
        ctx,
      ),
    ).rejects.toBeInstanceOf(CompanyNameError)
    expect(companyRejectStatistics.todayData.company).toBe(1)
  })

  it('supports negative lookaround and escaped keywords for job content matching', async () => {
    const safeJob = createJob({
      card: createJobCard({
        postDescription: '不是外包岗位，但维护外包系统与办公软件',
      }),
    })
    const actualMatchJob = createJob({
      card: createJobCard({
        postDescription: '负责外包岗位支持，并参与需求沟通',
      }),
    })
    const regexKeywordJob = createJob({
      card: createJobCard({
        postDescription: '负责C++开发和性能优化',
      }),
    })

    const safeStatistics = createStatistics()
    const safeFormData = createFormData()
    safeFormData.jobContent.enable = true
    safeFormData.jobContent.include = false
    safeFormData.jobContent.value = ['外包']

    await expect(
      getHandler(createJobContentStep(safeFormData, safeStatistics, toCause)())(
        { data: safeJob },
        createLogContext(safeJob),
      ),
    ).resolves.toBeUndefined()
    expect(safeStatistics.todayData.jobContent).toBe(0)

    const rejectStatistics = createStatistics()
    await expect(
      getHandler(createJobContentStep(safeFormData, rejectStatistics, toCause)())(
        { data: actualMatchJob },
        createLogContext(actualMatchJob),
      ),
    ).rejects.toBeInstanceOf(JobDescriptionError)
    expect(rejectStatistics.todayData.jobContent).toBe(1)

    const regexStatistics = createStatistics()
    const regexFormData = createFormData()
    regexFormData.jobContent.enable = true
    regexFormData.jobContent.include = false
    regexFormData.jobContent.value = ['C++']

    await expect(
      getHandler(createJobContentStep(regexFormData, regexStatistics, toCause)())(
        { data: regexKeywordJob },
        createLogContext(regexKeywordJob),
      ),
    ).rejects.toBeInstanceOf(JobDescriptionError)
    expect(regexStatistics.todayData.jobContent).toBe(1)

    const includeStatistics = createStatistics()
    const includeFormData = createFormData()
    includeFormData.jobContent.enable = true
    includeFormData.jobContent.include = true
    includeFormData.jobContent.value = ['外包']

    await expect(
      getHandler(createJobContentStep(includeFormData, includeStatistics, toCause)())(
        { data: safeJob },
        createLogContext(safeJob),
      ),
    ).rejects.toThrow('工作内容中不包含关键词')
  })
})
