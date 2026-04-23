// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockExternalReview,
} = vi.hoisted(() => ({
  mockExternalReview: vi.fn(),
}))

vi.mock('@/pages/zhipin/hooks/agentReview', () => ({
  requestExternalAIFilterReview: mockExternalReview,
}))

import {
  cachePipelineResult,
  checkJobCache,
  createHandle,
  getCacheManager,
} from '@/composables/useApplying'
import { handles } from '@/composables/useApplying/handles'
import type { Handler, Step } from '@/composables/useApplying/type'
import { sameCompanyKey, sameHrKey } from '@/composables/useApplying/utils'
import { useModel } from '@/composables/useModel'
import type { modelData } from '@/composables/useModel'
import type { Llm } from '@/composables/useModel/type'
import { counter } from '@/message'
import { useConf, defaultFormData } from '@/stores/conf'
import type { logData } from '@/stores/log'
import { useStatistics } from '@/stores/statistics'
import { useUser } from '@/stores/user'
import {
  AIFilteringError,
  FriendStatusError,
  JobAddressError,
  RepeatError,
} from '@/types/deliverError'
import deepmerge, { jsonClone } from '@/utils/deepmerge'

import { createJob, createJobCard, createLogContext } from './helpers/jobs'
import { setupPinia } from './helpers/pinia'

function resetStatistics() {
  const stats = useStatistics()
  Object.assign(stats.todayData, {
    activityFilter: 0,
    aiFiltering: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    aiRequestCount: 0,
    aiTotalCost: 0,
    aiTotalTokens: 0,
    amap: 0,
    company: 0,
    companySizeRange: 0,
    date: stats.todayData.date,
    goldHunterFilter: 0,
    hrPosition: 0,
    jobAddress: 0,
    jobContent: 0,
    jobTitle: 0,
    repeat: 0,
    salaryRange: 0,
    success: 0,
    total: 0,
  })
}

function resetConf() {
  const conf = useConf()
  deepmerge(conf.formData, jsonClone(defaultFormData), { clone: false })
  return conf
}

function setupUser() {
  window._PAGE = {
    uid: 1,
    userId: 1,
  } as Window['_PAGE']
}

function clearPageUser() {
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, '_PAGE')
}

function getHandler(step: Step | undefined): Handler {
  if (typeof step !== 'function') {
    throw new TypeError('Expected function step')
  }
  return step
}

function getObjectStep(step: Step | undefined) {
  if (!step || typeof step === 'function') {
    throw new TypeError('Expected object step')
  }
  return step
}

function createModelItem(overrides: Partial<modelData> = {}): modelData {
  return {
    data: {
      advanced: {},
      api_key: 'secret',
      model: 'gpt-4o-mini',
      mode: 'openai',
      other: {},
      url: 'https://api.example.com',
    },
    key: 'model-1',
    name: 'Mock Model',
    ...overrides,
  }
}

describe('useApplying handles', () => {
  beforeEach(() => {
    setupPinia()
    setupUser()
    const conf = resetConf()
    resetStatistics()
    useModel().modelData = []
    conf.formData.aiFiltering.enable = false
    mockExternalReview.mockReset()
  })

  it('filters repeated contacts and increments repeat statistics', async () => {
    const job = createJob({ contact: true })
    const step = getHandler(handles().communicated())

    await expect(step({ data: job }, createLogContext(job))).rejects.toBeInstanceOf(RepeatError)
    expect(useStatistics().todayData.repeat).toBe(1)
  })

  it('persists duplicate company ids and rejects already delivered companies', async () => {
    const conf = useConf()
    conf.formData.sameCompanyFilter.value = true
    await counter.storageSet(sameCompanyKey, { 1: ['brand-seen'] })

    const handler = getObjectStep(handles().SameCompanyFilter())
    const duplicateJob = createJob({ encryptBrandId: 'brand-seen' })
    await expect(
      handler.fn?.({ data: duplicateJob }, createLogContext(duplicateJob)),
    ).rejects.toBeInstanceOf(RepeatError)

    for (const brandId of ['brand-a', 'brand-b', 'brand-c', 'brand-d']) {
      const job = createJob({ encryptBrandId: brandId })
      await handler.fn?.({ data: job }, createLogContext(job))
      await handler.after?.({ data: job }, createLogContext(job))
    }

    expect(await counter.storageGet(sameCompanyKey)).toEqual({
      1: ['brand-seen', 'brand-a', 'brand-b', 'brand-c', 'brand-d'],
    })
  })

  it('supports same hr duplicate filtering', async () => {
    const conf = useConf()
    conf.formData.sameHrFilter.value = true
    await counter.storageSet(sameHrKey, { 1: ['boss-seen'] })

    const handler = getObjectStep(handles().SameHrFilter())
    const job = createJob({ encryptBossId: 'boss-seen' })

    await expect(handler.fn?.({ data: job }, createLogContext(job))).rejects.toBeInstanceOf(
      RepeatError,
    )
  })

  it('uses encryptUserId as duplicate-filter scope when numeric uid is unavailable', async () => {
    const conf = useConf()
    const user = useUser()
    conf.formData.sameCompanyFilter.value = true

    clearPageUser()
    user.info.value = {
      encryptUserId: 'encrypted-user-1',
      userId: undefined,
    } as any
    await counter.storageSet(sameCompanyKey, { 'encrypted-user-1': ['brand-seen'] })

    const handler = getObjectStep(handles().SameCompanyFilter())
    const duplicateJob = createJob({ encryptBrandId: 'brand-seen' })

    await expect(
      handler.fn?.({ data: duplicateJob }, createLogContext(duplicateJob)),
    ).rejects.toBeInstanceOf(RepeatError)
  })

  it('handles keyword and boundary filtering for title, content and friend status', async () => {
    const conf = useConf()
    const job = createJob({
      card: createJobCard({
        address: '浦东软件园',
        friendStatus: 1,
        postDescription: '不是外包岗位，但需要前端开发经验',
      }),
      jobName: '高级前端工程师',
    })
    const ctx = createLogContext(job)

    conf.formData.jobTitle.enable = true
    conf.formData.jobTitle.include = false
    conf.formData.jobTitle.value = ['前端']
    await expect(getHandler(handles().jobTitle())({ data: job }, ctx)).rejects.toThrow(
      '岗位名含有排除关键词 [前端]',
    )

    conf.formData.jobContent.enable = true
    conf.formData.jobContent.include = false
    conf.formData.jobContent.value = ['外包']
    await expect(getHandler(handles().jobContent())({ data: job }, ctx)).resolves.toBeUndefined()

    job.card = createJobCard({
      friendStatus: 1,
      postDescription: '包含外包岗位描述',
    })
    await expect(getHandler(handles().jobContent())({ data: job }, ctx)).rejects.toThrow(
      '工作内容含有排除关键词 [外包]',
    )

    conf.formData.friendStatus.value = true
    await expect(
      getHandler(handles().jobFriendStatus())({ data: job }, ctx),
    ).rejects.toBeInstanceOf(FriendStatusError)
  })

  it('checks salary, company size, address, and activity boundaries', async () => {
    const conf = useConf()
    const job = createJob({
      brandScaleName: '20-99人',
      card: createJobCard({
        activeTimeDesc: '2个月前活跃',
        address: '杭州滨江',
      }),
      salaryDesc: '25-35K',
    })
    const ctx = createLogContext(job)

    conf.formData.salaryRange.enable = true
    conf.formData.salaryRange.value = [10, 20, true]
    await expect(getHandler(handles().salaryRange())({ data: job }, ctx)).rejects.toThrow(
      '不匹配的薪资范围',
    )

    conf.formData.companySizeRange.enable = true
    conf.formData.companySizeRange.value = [100, 300, false]
    await expect(getHandler(handles().companySizeRange())({ data: job }, ctx)).rejects.toThrow(
      '不匹配的公司规模',
    )

    conf.formData.jobAddress.enable = true
    conf.formData.jobAddress.value = ['上海']
    await expect(getHandler(handles().jobAddress())({ data: job }, ctx)).rejects.toBeInstanceOf(
      JobAddressError,
    )

    conf.formData.activityFilter.value = true
    await expect(getHandler(handles().activityFilter())({ data: job }, ctx)).rejects.toThrow(
      '不活跃',
    )
  })

  it('covers whitelist filters, advanced salary units and successful address checks', async () => {
    const conf = useConf()
    const job = createJob({
      brandName: 'Acme Tech',
      brandScaleName: '100-499人',
      card: createJobCard({
        address: '杭州滨江',
        bossTitle: '招聘经理',
        friendStatus: 0,
        postDescription: '负责前端开发和内部工具维护',
      }),
      jobName: 'Frontend Engineer',
      salaryDesc: '150元/时',
    })
    const ctx = createLogContext(job)

    conf.formData.jobTitle.enable = true
    conf.formData.jobTitle.include = true
    conf.formData.jobTitle.value = ['frontend']
    await expect(getHandler(handles().jobTitle())({ data: job }, ctx)).resolves.toBeUndefined()

    conf.formData.company.enable = true
    conf.formData.company.include = true
    conf.formData.company.value = ['Acme']
    await expect(getHandler(handles().company())({ data: job }, ctx)).resolves.toBeUndefined()

    conf.formData.salaryRange.enable = true
    conf.formData.salaryRange.advancedValue.H = [100, 200, true]
    await expect(getHandler(handles().salaryRange())({ data: job }, ctx)).resolves.toBeUndefined()

    job.salaryDesc = '300元/天'
    conf.formData.salaryRange.advancedValue.D = [200, 400, true]
    await expect(getHandler(handles().salaryRange())({ data: job }, ctx)).resolves.toBeUndefined()

    job.salaryDesc = '15000元/月'
    conf.formData.salaryRange.advancedValue.M = [10000, 20000, true]
    await expect(getHandler(handles().salaryRange())({ data: job }, ctx)).resolves.toBeUndefined()

    conf.formData.companySizeRange.enable = true
    conf.formData.companySizeRange.value = [50, 500, false]
    await expect(
      getHandler(handles().companySizeRange())({ data: job }, ctx),
    ).resolves.toBeUndefined()

    conf.formData.jobContent.enable = true
    conf.formData.jobContent.include = true
    conf.formData.jobContent.value = ['前端', '']
    await expect(getHandler(handles().jobContent())({ data: job }, ctx)).resolves.toBeUndefined()

    conf.formData.hrPosition.enable = true
    conf.formData.hrPosition.include = true
    conf.formData.hrPosition.value = ['招聘经理', '']
    await expect(getHandler(handles().hrPosition())({ data: job }, ctx)).resolves.toBeUndefined()

    conf.formData.jobAddress.enable = true
    conf.formData.jobAddress.value = ['', '杭州']
    await expect(getHandler(handles().jobAddress())({ data: job }, ctx)).resolves.toBeUndefined()

    conf.formData.friendStatus.value = true
    await expect(
      getHandler(handles().jobFriendStatus())({ data: job }, ctx),
    ).resolves.toBeUndefined()
  })

  it('covers whitelist miss branches for title, company, content and hr position', async () => {
    const conf = useConf()
    const job = createJob({
      brandName: 'Acme',
      card: createJobCard({
        bossTitle: 'CTO',
        postDescription: '负责后端服务开发',
      }),
      jobName: 'Frontend Engineer',
    })
    const ctx = createLogContext(job)

    conf.formData.jobTitle.enable = true
    conf.formData.jobTitle.include = true
    conf.formData.jobTitle.value = ['golang']
    await expect(getHandler(handles().jobTitle())({ data: job }, ctx)).rejects.toThrow(
      '岗位名不包含关键词',
    )

    conf.formData.company.enable = true
    conf.formData.company.include = true
    conf.formData.company.value = ['Other Corp']
    await expect(getHandler(handles().company())({ data: job }, ctx)).rejects.toThrow(
      '公司名不包含关键词',
    )

    conf.formData.jobContent.enable = true
    conf.formData.jobContent.include = true
    conf.formData.jobContent.value = ['算法']
    await expect(getHandler(handles().jobContent())({ data: job }, ctx)).rejects.toThrow(
      '工作内容中不包含关键词',
    )

    conf.formData.hrPosition.enable = true
    conf.formData.hrPosition.include = true
    conf.formData.hrPosition.value = ['HR']
    await expect(getHandler(handles().hrPosition())({ data: job }, ctx)).rejects.toThrow(
      'Hr职位不在白名单中',
    )
  })

  it('treats job content keywords as escaped precompiled literals', async () => {
    const conf = useConf()
    const job = createJob({
      card: createJobCard({
        postDescription: '负责括号()处理和正则文本 .* 的展示',
      }),
    })
    const ctx = createLogContext(job)

    conf.formData.jobContent.enable = true
    conf.formData.jobContent.include = false

    conf.formData.jobContent.value = ['(']
    await expect(getHandler(handles().jobContent())({ data: job }, ctx)).rejects.toThrow(
      '工作内容含有排除关键词 [(]',
    )

    conf.formData.jobContent.value = ['.*']
    job.card = createJobCard({
      postDescription: '普通文本，不应该因为正则通配符被误判',
    })
    await expect(getHandler(handles().jobContent())({ data: job }, ctx)).resolves.toBeUndefined()
  })

  it('precompiles job content patterns once per step creation', async () => {
    const conf = useConf()
    const job = createJob({
      card: createJobCard({
        postDescription: '包含外包岗位描述',
      }),
    })
    const ctx = createLogContext(job)

    conf.formData.jobContent.enable = true
    conf.formData.jobContent.include = false
    conf.formData.jobContent.value = ['外包', '销售']

    const step = getHandler(handles().jobContent())

    await expect(step({ data: job }, ctx)).rejects.toThrow('工作内容含有排除关键词 [外包]')
    await expect(step({ data: job }, ctx)).rejects.toThrow('工作内容含有排除关键词 [外包]')
  })

  it('uses external ai review responses without carrying greeting state', async () => {
    const conf = useConf()
    const job = createJob({ card: createJobCard() })
    const ctx = createLogContext(job)

    conf.formData.aiFiltering.enable = true
    conf.formData.aiFiltering.externalMode = true
    conf.formData.aiFiltering.prompt = '外部筛选'
    conf.formData.aiFiltering.score = 80
    mockExternalReview.mockResolvedValueOnce({
      accepted: false,
      negative: [{ reason: '通勤太远', score: 20 }],
      positive: [],
      rating: 60,
      reason: '评分不足',
    })

    await expect(getHandler(handles().aiFiltering())({ data: job }, ctx)).rejects.toBeInstanceOf(
      AIFilteringError,
    )
    expect(ctx.message).toBeUndefined()
    expect(ctx.aiFilteringScore).toEqual(
      expect.objectContaining({
        accepted: false,
        source: 'external',
        threshold: 80,
      }),
    )
  })

  it('uses internal ai filtering model and records parsed results', async () => {
    const conf = useConf()
    const model = useModel()
    const job = createJob({ card: createJobCard() })
    const ctx = createLogContext(job, {
      bossData: {
        data: {
          bossId: 2,
          encryptBossId: 'encrypt-boss-2',
        },
      } as unknown as logData['bossData'],
    })

    conf.formData.aiFiltering.enable = true
    conf.formData.aiFiltering.model = 'model-1'
    conf.formData.aiFiltering.prompt = '筛选一下'
    conf.formData.aiFiltering.score = 5
    model.modelData = [
      createModelItem({
        data: {
          advanced: {},
          api_key: 'secret',
          model: 'gpt-4o-mini',
          mode: 'openai',
          other: {
            pricingInputPerMillion: 1,
            pricingOutputPerMillion: 2,
          },
          url: 'https://api.example.com',
        },
      }),
    ]
    vi.spyOn(model, 'getModel').mockReturnValue({
      message: vi.fn(async () => ({
        content: '```json\n{"negative":[],"positive":[{"reason":"双休","score":10}]}\n```',
        prompt: 'prompt body',
        reasoning_content: 'reasoning',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          total_tokens: 1500,
        },
      })),
    } as unknown as Llm)

    await expect(getHandler(handles().aiFiltering())({ data: job }, ctx)).resolves.toBeUndefined()
    expect(ctx.aiFilteringAjson).toEqual({
      negative: [],
      positive: [{ reason: '双休', score: 10 }],
    })
    expect(ctx.aiFilteringScore).toEqual(
      expect.objectContaining({
        accepted: true,
        rating: 10,
        source: 'internal',
      }),
    )
    expect(useStatistics().todayData.aiRequestCount).toBe(1)
    expect(useStatistics().todayData.aiInputTokens).toBe(1000)
    expect(useStatistics().todayData.aiOutputTokens).toBe(500)
    expect(useStatistics().todayData.aiTotalTokens).toBe(1500)
    expect(useStatistics().todayData.aiTotalCost).toBe(0.002)
  })

  it('covers ai filtering setup, accepted external reviews and internal edge cases', async () => {
    const conf = useConf()
    const model = useModel()
    const job = createJob({ card: createJobCard() })
    const ctx = createLogContext(job)

    conf.formData.aiFiltering.enable = true
    conf.formData.aiFiltering.model = 'missing-model'
    model.modelData = []

    expect(() => handles().aiFiltering()).toThrow('没有找到AI筛选的模型')

    conf.formData.aiFiltering.externalMode = true
    conf.formData.aiFiltering.prompt = '外部通过'
    conf.formData.aiFiltering.score = 60
    mockExternalReview.mockResolvedValueOnce({
      accepted: true,
      negative: [],
      positive: [{ reason: '匹配度高', score: 80 }],
      rating: 80,
      reason: '审核通过',
    })

    await expect(getHandler(handles().aiFiltering())({ data: job }, ctx)).resolves.toBeUndefined()
    expect(ctx.aiFilteringScore).toEqual(
      expect.objectContaining({
        accepted: true,
        source: 'external',
      }),
    )

    conf.formData.aiFiltering.externalMode = false
    conf.formData.aiFiltering.model = 'model-1'
    conf.formData.aiFiltering.score = 10
    model.modelData = [createModelItem()]

    const getModelSpy = vi.spyOn(model, 'getModel')
    getModelSpy.mockReturnValueOnce({
      message: vi.fn(async () => ({
        content: null,
        prompt: 'null-content prompt',
        reasoning_content: null,
      })),
    } as unknown as Llm)

    const nullCtx = createLogContext(createJob({ card: createJobCard() }))
    await expect(
      getHandler(handles().aiFiltering())({ data: job }, nullCtx),
    ).rejects.toBeInstanceOf(AIFilteringError)
    expect(nullCtx.aiFilteringQ).toBe('null-content prompt')
    expect(nullCtx.aiFilteringScore).toBeUndefined()
    expect(nullCtx.pipelineError).toBeUndefined()

    getModelSpy.mockReturnValueOnce({
      message: vi.fn(async () => ({
        content: '```json\n{"negative":[{"reason":"通勤太远","score":20}],"positive":[]}\n```',
        prompt: 'low-score prompt',
        reasoning_content: null,
      })),
    } as unknown as Llm)

    const lowScoreCtx = createLogContext(createJob({ card: createJobCard() }))
    await expect(
      getHandler(handles().aiFiltering())({ data: job }, lowScoreCtx),
    ).rejects.toBeInstanceOf(AIFilteringError)
    expect(lowScoreCtx.aiFilteringScore).toEqual(
      expect.objectContaining({
        accepted: false,
        rating: -20,
        source: 'internal',
      }),
    )
    getModelSpy.mockReturnValueOnce({
      message: vi.fn(async () => {
        throw new Error('llm unavailable')
      }),
    } as unknown as Llm)

    await expect(
      getHandler(handles().aiFiltering())({ data: job }, createLogContext(job)),
    ).rejects.toThrow('llm unavailable')

    getModelSpy.mockReturnValueOnce({
      message: vi.fn(async () => {
        throw new Error('The user aborted a request.')
      }),
    } as unknown as Llm)

    await expect(
      getHandler(handles().aiFiltering())({ data: job }, createLogContext(job)),
    ).rejects.toThrow('请求超时')
  })

  it('passes zeroed location tokens to AI filtering for removed legacy prompt fields', async () => {
    const conf = useConf()
    const model = useModel()
    const job = createJob({ card: createJobCard() })
    const ctx = createLogContext(job)

    conf.formData.aiFiltering.enable = true
    conf.formData.aiFiltering.externalMode = false
    conf.formData.aiFiltering.model = 'model-1'
    conf.formData.aiFiltering.score = 0
    model.modelData = [createModelItem()]

    vi.spyOn(model, 'getModel').mockReturnValueOnce({
      message: vi.fn(async (args: { data: { amap: Record<string, number> } }) => {
        expect(args.data.amap).toEqual({
          drivingDistance: 0,
          drivingDuration: 0,
          straightDistance: 0,
          walkingDistance: 0,
          walkingDuration: 0,
        })

        return {
          content: '```json\n{"negative":[],"positive":[{"reason":"可接受","score":10}]}\n```',
          prompt: 'legacy prompt',
          reasoning_content: null,
        }
      }),
    } as unknown as Llm)

    await expect(getHandler(handles().aiFiltering())({ data: job }, ctx)).resolves.toBeUndefined()
    expect(ctx.aiFilteringScore).toEqual(
      expect.objectContaining({
        accepted: true,
        rating: 10,
      }),
    )
  })

  it('runs ai filtering without extra location resolution steps', async () => {
    const conf = useConf()
    const model = useModel()
    const job = createJob({ card: createJobCard() })
    const ctx = createLogContext(job)

    conf.formData.sameCompanyFilter.value = false
    conf.formData.sameHrFilter.value = false
    conf.formData.friendStatus.value = false
    conf.formData.activityFilter.value = false
    conf.formData.aiFiltering.enable = true
    conf.formData.aiFiltering.externalMode = false
    conf.formData.aiFiltering.model = 'model-1'
    conf.formData.aiFiltering.score = 0
    model.modelData = [createModelItem()]

    vi.spyOn(model, 'getModel').mockReturnValueOnce({
      message: vi.fn(async () => ({
        content: '```json\n{"negative":[],"positive":[{"reason":"匹配","score":10}]}\n```',
        prompt: 'prompt body',
        reasoning_content: null,
      })),
    } as unknown as Llm)

    const pipeline = await createHandle()
    await expect(
      (async () => {
        for (const step of pipeline.before) {
          await step({ data: job }, ctx)
        }
      })(),
    ).resolves.toBeUndefined()

    expect(ctx.aiFilteringScore).toEqual(
      expect.objectContaining({
        accepted: true,
        rating: 10,
        source: 'internal',
      }),
    )
  })

  it('covers activity fallback timestamps', async () => {
    const conf = useConf()
    conf.formData.activityFilter.value = true

    const recentJob = createJob({
      card: createJobCard({
        activeTimeDesc: '',
        brandComInfo: {
          ...createJobCard().brandComInfo,
          activeTime: Date.now() - 60_000,
        },
      }),
    })
    await expect(
      getHandler(handles().activityFilter())({ data: recentJob }, createLogContext(recentJob)),
    ).resolves.toBeUndefined()

    const staleJob = createJob({
      card: createJobCard({
        activeTimeDesc: '',
        brandComInfo: {
          ...createJobCard().brandComInfo,
          activeTime: Date.now() - 8 * 24 * 60 * 60 * 1000,
        },
      }),
    })
    await expect(
      getHandler(handles().activityFilter())({ data: staleJob }, createLogContext(staleJob)),
    ).rejects.toThrow('不活跃')

    const emptyJob = createJob({
      card: createJobCard({
        activeTimeDesc: '',
        brandComInfo: {
          ...createJobCard().brandComInfo,
          activeTime: 0,
        },
      }),
    })
    await expect(
      getHandler(handles().activityFilter())({ data: emptyJob }, createLogContext(emptyJob)),
    ).rejects.toThrow('无活跃内容')
  })

  it('wraps failing pipeline steps with detailed pipelineError context', async () => {
    const conf = useConf()
    conf.formData.sameCompanyFilter.value = false
    conf.formData.sameHrFilter.value = false
    conf.formData.friendStatus.value = false
    conf.formData.activityFilter.value = false
    conf.formData.jobAddress.enable = true
    conf.formData.aiFiltering.enable = false

    const job = createJob({
      card: undefined,
      getCard: vi.fn(async () => null as unknown as NonNullable<ReturnType<typeof createJob>['card']>),
    })
    const ctx = createLogContext(job)
    const pipeline = await createHandle()

    await expect(
      (async () => {
        for (const step of pipeline.before) {
          await step({ data: job }, ctx)
        }
      })(),
    ).rejects.toThrow('Card 信息获取失败')

    expect(ctx.pipelineError).toEqual(
      expect.objectContaining({
        errorMessage: 'Card 信息获取失败',
        errorName: '未知错误',
        jobId: 'job-1',
        stage: 'before',
        step: 'loadCard',
      }),
    )
  })

  it('wraps loadCard edge-case failures through createHandle', async () => {
    const conf = useConf()
    conf.formData.sameCompanyFilter.value = false
    conf.formData.sameHrFilter.value = false
    conf.formData.friendStatus.value = false
    conf.formData.activityFilter.value = false
    conf.formData.aiFiltering.enable = false

    conf.formData.jobAddress.enable = true
    conf.formData.jobAddress.value = []

    const missingCardJob = createJob({
      card: undefined,
      getCard: vi.fn(
        async () => null as unknown as NonNullable<ReturnType<typeof createJob>['card']>,
      ),
    })
    const missingCardCtx = createLogContext(missingCardJob)
    const loadCardPipeline = await createHandle()

    await expect(
      (async () => {
        for (const step of loadCardPipeline.before) {
          await step({ data: missingCardJob }, missingCardCtx)
        }
      })(),
    ).rejects.toThrow('Card 信息获取失败')

    expect(missingCardCtx.pipelineError).toEqual(
      expect.objectContaining({
        jobId: 'job-1',
        stage: 'before',
        step: 'loadCard',
      }),
    )
  })

  it('caches pipeline results and supports anonymous cache managers', async () => {
    const user = useUser()

    await cachePipelineResult(
      'job-cache',
      'Frontend Engineer',
      'Acme',
      'success',
      'AI 分数 88',
      'aiFiltering',
    )
    expect(checkJobCache('job-cache')).toEqual(
      expect.objectContaining({
        brandName: 'Acme',
        encryptJobId: 'job-cache',
        processorType: 'aiFiltering',
      }),
    )
    expect(checkJobCache('job-missing')).toBeNull()

    user.info.value = undefined
    clearPageUser()

    const anonymousA = getCacheManager()
    const anonymousB = getCacheManager()
    expect(anonymousA).toBe(anonymousB)

    user.info.value = {
      encryptUserId: 'encrypted-cache-user',
      userId: undefined,
    } as any

    const scopedA = getCacheManager()
    const scopedB = getCacheManager()
    expect(scopedA).toBe(scopedB)
    expect(scopedA).not.toBe(anonymousA)
  })

  it('returns per-user cache managers', () => {
    const managerA = getCacheManager('user-a')
    const managerB = getCacheManager('user-b')
    const managerA2 = getCacheManager('user-a')

    expect(managerA).toBe(managerA2)
    expect(managerA).not.toBe(managerB)
  })

  it('evicts least recently used cache managers when user ids keep growing', () => {
    const retainedManagers = new Map<string, ReturnType<typeof getCacheManager>>()

    for (let index = 0; index < 8; index += 1) {
      retainedManagers.set(`user-${index}`, getCacheManager(`user-${index}`))
    }

    expect(getCacheManager('user-0')).toBe(retainedManagers.get('user-0'))

    const overflowManager = getCacheManager('user-overflow')
    expect(overflowManager).toBe(getCacheManager('user-overflow'))

    expect(getCacheManager('user-0')).toBe(retainedManagers.get('user-0'))
    expect(getCacheManager('user-1')).not.toBe(retainedManagers.get('user-1'))
  })
})
