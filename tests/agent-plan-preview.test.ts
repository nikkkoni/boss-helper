// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import type { CreateApplyingPipelineOptions } from '@/composables/useApplying'
import { defaultFormData } from '@/stores/conf'
import type { MyJobListData } from '@/stores/jobs'
import type { logData } from '@/stores/log'
import { JobTitleError } from '@/types/deliverError'
import { jsonClone } from '@/utils/deepmerge'

import { previewAgentPlan } from '@/pages/zhipin/services/agentPlanPreview'

function createJob(overrides: Partial<MyJobListData> = {}): MyJobListData {
  const status: MyJobListData['status'] = {
    msg: '等待中',
    status: 'wait',
    setStatus(nextStatus: MyJobListData['status']['status'], nextMessage?: string) {
      status.status = nextStatus
      status.msg = nextMessage ?? ''
    },
  }

  return {
    areaDistrict: '浦东新区',
    bossName: '张女士',
    bossTitle: 'HR',
    brandLogo: '',
    brandName: '测试公司',
    brandScaleName: '100-499人',
    cityName: '上海',
    contact: false,
    encryptBossId: 'boss-1',
    encryptBrandId: 'brand-1',
    encryptJobId: 'job-1',
    getCard: async () => {
      throw new Error('not implemented')
    },
    goldHunter: 0,
    jobLabels: [],
    jobName: '前端工程师',
    salaryDesc: '15-25K',
    skills: [],
    status,
    welfareList: [],
    ...overrides,
  } as MyJobListData
}

describe('previewAgentPlan', () => {
  it('classifies existing statuses, deterministic filters, and external review gates', async () => {
    const runtimeConfig = jsonClone(defaultFormData)
    runtimeConfig.aiFiltering.enable = true
    runtimeConfig.aiFiltering.externalMode = true
    runtimeConfig.aiFiltering.score = 75

    const createHandleFn = vi.fn(async (options?: CreateApplyingPipelineOptions) => {
      expect(options?.currentUserId).toBe(1001)
      expect(options).toEqual(
        expect.objectContaining({
          includeAiFiltering: false,
          includeGreeting: false,
        }),
      )

      return {
        after: [],
        before: [
          async ({ data }: { data: MyJobListData }, ctx: logData) => {
            if (data.encryptJobId !== 'job-filtered') {
              return
            }

            ctx.pipelineError = {
              errorMessage: '岗位名不包含关键词',
              errorName: '岗位名筛选',
              jobId: data.encryptJobId,
              stage: 'before',
              step: 'jobTitle',
            }
            throw new JobTitleError('岗位名不包含关键词')
          },
        ],
      }
    })

    const result = await previewAgentPlan(undefined, {
      createHandleFn,
      jobs: [
        createJob({
          encryptJobId: 'job-success',
          status: {
            msg: '投递成功',
            status: 'success',
            setStatus: vi.fn(),
          },
        }),
        createJob({
          encryptJobId: 'job-warn',
          status: {
            msg: 'AI筛选未通过 (缓存)',
            status: 'warn',
            setStatus: vi.fn(),
          },
        }),
        createJob({ encryptJobId: 'job-filtered', jobName: '后端工程师' }),
        createJob({ encryptJobId: 'job-ready' }),
      ],
      modelStore: {
        initModel: vi.fn(async () => undefined),
        modelData: [{ key: 'model-1' }],
      },
      resolveCurrentUserId: vi.fn(async () => 1001),
      runtimeConfig,
    })

    expect(result.summary).toEqual(
      expect.objectContaining({
        needsExternalReviewCount: 1,
        readyCount: 0,
        scopedCount: 4,
        skipCount: 3,
      }),
    )
    expect(result.items).toEqual([
      expect.objectContaining({
        decision: 'skip',
        job: expect.objectContaining({ encryptJobId: 'job-success' }),
        stage: 'current-status',
      }),
      expect.objectContaining({
        decision: 'skip',
        job: expect.objectContaining({ encryptJobId: 'job-warn' }),
        stage: 'current-status',
      }),
      expect.objectContaining({
        decision: 'skip',
        issues: [expect.objectContaining({ code: 'filtered-jobTitle', step: 'jobTitle' })],
        job: expect.objectContaining({ encryptJobId: 'job-filtered' }),
        stage: 'filters',
      }),
      expect.objectContaining({
        decision: 'needs-external-review',
        issues: [expect.objectContaining({ code: 'external-ai-review-required' })],
        job: expect.objectContaining({ encryptJobId: 'job-ready' }),
        remainingSteps: expect.arrayContaining(['external-ai-review', 'apply']),
        stage: 'ai-filtering',
      }),
    ])
    expect(createHandleFn).toHaveBeenCalledTimes(1)
  })

  it('marks targeted stale statuses and missing preview inputs without mutating execution state', async () => {
    const runtimeConfig = jsonClone(defaultFormData)
    runtimeConfig.aiFiltering.enable = true
    runtimeConfig.aiFiltering.externalMode = false
    runtimeConfig.aiFiltering.model = 'missing-model'

    const createHandleFn = vi.fn(async () => ({
      after: [],
      before: [
        async ({ data }: { data: MyJobListData }, ctx: logData) => {
          if (data.encryptJobId !== 'job-no-card') {
            return
          }

          ctx.pipelineError = {
            errorMessage: 'Card 信息获取失败',
            errorName: '未知错误',
            jobId: data.encryptJobId,
            stage: 'before',
            step: 'loadCard',
          }
          throw new Error('Card 信息获取失败')
        },
      ],
    }))

    const result = await previewAgentPlan(
      {
        jobIds: ['job-stale', 'job-no-card', 'job-ai', 'missing-job'],
      },
      {
        createHandleFn,
        jobs: [
          createJob({
            encryptJobId: 'job-stale',
            status: {
              msg: '处理中',
              status: 'error',
              setStatus: vi.fn(),
            },
          }),
          createJob({ encryptJobId: 'job-no-card' }),
          createJob({ encryptJobId: 'job-ai' }),
        ],
        modelStore: {
          initModel: vi.fn(async () => undefined),
          modelData: [],
        },
        resolveCurrentUserId: vi.fn(async () => 1001),
        runtimeConfig,
      },
    )

    expect(result.summary).toEqual(
      expect.objectContaining({
        missingInfoCount: 2,
        scopedCount: 3,
        skipCount: 1,
        unknownTargetJobIds: ['missing-job'],
      }),
    )
    expect(result.items).toEqual([
      expect.objectContaining({
        decision: 'skip',
        issues: [expect.objectContaining({ code: 'status-not-wait' })],
        job: expect.objectContaining({ encryptJobId: 'job-stale' }),
      }),
      expect.objectContaining({
        decision: 'missing-info',
        issues: [expect.objectContaining({ code: 'job-card-unavailable', step: 'loadCard' })],
        job: expect.objectContaining({ encryptJobId: 'job-no-card' }),
        stage: 'load-card',
      }),
      expect.objectContaining({
        decision: 'missing-info',
        issues: [expect.objectContaining({ code: 'ai-filtering-model-missing' })],
        job: expect.objectContaining({ encryptJobId: 'job-ai' }),
        stage: 'ai-filtering',
      }),
    ])
  })

  it('treats targeted pending jobs as runnable in preview', async () => {
    const result = await previewAgentPlan(
      {
        jobIds: ['job-pending'],
      },
      {
        createHandleFn: vi.fn(async () => ({
          after: [],
          before: [],
        })),
        jobs: [
          createJob({
            encryptJobId: 'job-pending',
            status: {
              msg: '未开始',
              status: 'pending',
              setStatus: vi.fn(),
            },
          }),
        ],
        modelStore: {
          initModel: vi.fn(async () => undefined),
          modelData: [],
        },
        resolveCurrentUserId: vi.fn(async () => 1001),
        runtimeConfig: jsonClone(defaultFormData),
      },
    )

    expect(result.summary).toEqual(
      expect.objectContaining({
        readyCount: 1,
        scopedCount: 1,
        skipCount: 0,
      }),
    )
    expect(result.items).toEqual([
      expect.objectContaining({
        decision: 'ready',
        job: expect.objectContaining({
          encryptJobId: 'job-pending',
          status: 'wait',
          statusMsg: '等待中',
        }),
        stage: 'ready',
      }),
    ])
  })
})
