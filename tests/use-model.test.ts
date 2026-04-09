import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { modelData } from '@/composables/useModel'

import { setupPinia } from './helpers/pinia'
import { createJob, createJobCard } from './helpers/jobs'
import { __setStorageItem } from './mocks/message'

function createModelItem(overrides: Partial<modelData> = {}): modelData {
  return {
    data: {
      advanced: {},
      api_key: 'secret',
      model: 'gpt-4o-mini',
      mode: 'openai',
      other: {},
      url: 'https://api.example.com/v1/chat/completions',
    },
    key: 'model',
    name: 'Model',
    ...overrides,
  }
}

const {
  mockLoggerWarn,
  mockRequestPost,
  mockRunBatchedAIRequest,
  mockRunLimitedAIRequest,
  mockSignedKeyGet,
  mockSignedKeyPost,
  mockSignedKeyReqHandler,
} = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
  mockRequestPost: vi.fn(),
  mockRunBatchedAIRequest: vi.fn(async (_key: string, task: () => unknown) => task()),
  mockRunLimitedAIRequest: vi.fn(async (task: () => unknown) => task()),
  mockSignedKeyGet: vi.fn(),
  mockSignedKeyPost: vi.fn(),
  mockSignedKeyReqHandler: vi.fn((payload: { error?: string | null }) => payload.error ?? undefined),
}))

vi.mock('@/utils/concurrency', () => ({
  runBatchedAIRequest: mockRunBatchedAIRequest,
  runLimitedAIRequest: mockRunLimitedAIRequest,
}))

vi.mock('@/utils/request', () => {
  class RequestError extends Error {
    statusCode?: number

    constructor(message: string, statusCode?: number) {
      super(message)
      this.name = '请求错误'
      this.statusCode = statusCode
    }
  }

  return {
    RequestError,
    request: {
      post: mockRequestPost,
    },
  }
})

vi.mock('@/stores/signedKey', () => ({
  signedKeyReqHandler: mockSignedKeyReqHandler,
  useSignedKey: () => ({
    client: {
      GET: mockSignedKeyGet,
      POST: mockSignedKeyPost,
    },
  }),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: mockLoggerWarn,
  },
}))

import { useModel } from '@/composables/useModel'
import { SignedKeyLLM } from '@/composables/useModel/signedKey'
import { llm } from '@/composables/useModel/type'
import { RequestError } from '@/utils/request'

class TestLLM extends llm<Record<string, never>> {
  async chat(message: string) {
    return message
  }

  async message() {
    return {
      content: 'ok',
    }
  }
}

describe('useModel', () => {
  beforeEach(() => {
    setupPinia()
    mockRequestPost.mockReset()
    mockRunBatchedAIRequest.mockClear()
    mockRunLimitedAIRequest.mockClear()
    mockLoggerWarn.mockReset()
    mockSignedKeyReqHandler.mockReset()
    mockSignedKeyReqHandler.mockImplementation((payload: { error?: string | null }) => payload.error ?? undefined)
    mockSignedKeyGet.mockReset()
    mockSignedKeyGet.mockResolvedValue({
      data: {
        content: 'resume ok',
        reasoning_content: null,
        token_usage: {
          input_tokens: 1,
          output_tokens: 2,
          total_tokens: 3,
        },
      },
      error: null,
    })
    mockSignedKeyPost.mockReset()
    mockSignedKeyPost.mockImplementation(async (_path: string, { body }: { body: { user_request: string } }) => ({
      data: {
        content: `reply:${body.user_request}`,
        reasoning_content: 'analysis',
        token_usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
      },
      error: null,
    }))
  })

  it('builds prompts for string and multi-turn templates', () => {
    const single = new TestLLM({}, '你好 {{ data.jobName }}')
    expect(single.buildPrompt({ data: createJob({ jobName: '前端工程师' }) })).toEqual([
      {
        content: '你好 前端工程师',
        role: 'user',
      },
    ])

    const multi = new TestLLM(
      {},
      [
        { content: '系统提示', role: 'system' },
        { content: '岗位 {{ data.jobName }}', role: 'user' },
      ],
    )
    expect(multi.buildPrompt({ data: createJob({ jobName: '后端工程师' }) })).toEqual([
      { content: '系统提示', role: 'system' },
      { content: '岗位 后端工程师', role: 'user' },
    ])
    expect(multi.buildPrompt('直接消息')).toEqual([{ content: '直接消息', role: 'user' }])

    expect(() => new TestLLM({}, [])).toThrow('多对话提示词不能为空')
  })

  it('migrates legacy stored models into session storage on init', async () => {
    __setStorageItem('sync:conf-model', [
      createModelItem({
        data: {
          advanced: {},
          api_key: 'legacy-key',
          model: 'gpt-4o-mini',
          mode: 'openai',
          other: {},
          url: 'https://api.example.com/v1/chat/completions',
        },
        key: 'legacy',
        name: 'Legacy model',
      }),
    ])

    const store = useModel()
    await store.initModel()

    expect(store.modelData).toHaveLength(1)
    expect(store.modelData[0].name).toBe('Legacy model')
  })

  it('builds an OpenAI model and retries retryable request errors', async () => {
    const store = useModel()
    const llm = store.getModel(
      {
        ...createModelItem({
          data: {
            advanced: {
              json: true,
              stream: false,
              temperature: 0.5,
            },
            api_key: 'secret',
            model: 'gpt-4o-mini',
            mode: 'openai',
            other: {
              background: false,
              timeout: 1800,
            },
            url: 'https://api.example.com/v1/chat/completions',
          },
          key: 'openai',
          name: 'OpenAI',
        }),
      },
      '你好 {{ data.jobName }}',
    )

    mockRequestPost
      .mockRejectedValueOnce(Object.assign(new RequestError('状态码: 429'), { statusCode: 429 }))
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '{"accepted":true}',
              reasoning_content: 'step by step',
            },
          },
        ],
        usage: {
          completion_tokens: 7,
          prompt_tokens: 3,
          total_tokens: 10,
        },
      })

    const response = await llm.message(
      {
        data: {
          card: createJobCard(),
          data: createJob({ jobName: '前端工程师' }),
        },
        json: true,
        onPrompt: vi.fn(),
      },
      'aiFiltering',
    )

    expect(mockRequestPost).toHaveBeenCalledTimes(2)
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'AI请求重试',
      expect.objectContaining({ attempt: 1, nextAttempt: 2 }),
    )
    expect(response).toEqual(
      expect.objectContaining({
        content: '{"accepted":true}',
        reasoning_content: 'step by step',
        usage: {
          input_tokens: 3,
          output_tokens: 7,
          total_tokens: 10,
        },
      }),
    )
  })

  it('returns stream-mode responses without usage metadata', async () => {
    const store = useModel()
    const openaiModel = store.getModel(
      createModelItem({
        data: {
          advanced: {
            stream: true,
          },
          api_key: 'secret',
          model: 'gpt-4o-mini',
          mode: 'openai',
          other: {},
          url: 'https://api.example.com/v1/chat/completions',
        },
      }),
      '你好 {{ data.jobName }}',
    )

    mockRequestPost.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'ignored',
          },
        },
      ],
    })

    const response = await openaiModel.message(
      {
        data: {
          card: createJobCard(),
          data: createJob({ jobName: '前端工程师' }),
        },
        onPrompt: vi.fn(),
      },
      'aiFiltering',
    )

    expect(response.content).toBe('')
    expect(response.usage).toBeUndefined()
  })

  it('throws for invalid VIP prompt shapes and returns SignedKeyLLM for valid ones', async () => {
    const store = useModel()

    expect(() => store.getModel(undefined, [{ content: 'x', role: 'user' }], true)).toThrow(
      'VIP模型必须传入字符串',
    )

    const vip = store.getModel(undefined, '筛选岗位', true)
    const response = await vip.message(
      {
        amap: '通勤 10 分钟',
        data: {
          card: createJobCard(),
          data: createJob({ jobName: 'Frontend Engineer' }),
        },
      },
      'aiFiltering',
    )

    expect(response.content).toBe('reply:筛选岗位通勤 10 分钟')
    expect(response.usage?.total_tokens).toBe(15)
  })

  it('logs checkResume failures for VIP models instead of leaking rejections', async () => {
    mockSignedKeyGet.mockResolvedValueOnce({
      data: null,
      error: 'resume offline',
    })

    const store = useModel()
    store.getModel(undefined, '筛选岗位', true)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'VIP模型简历检查失败',
      expect.objectContaining({ error: 'resume offline' }),
    )
  })

  it('routes signed-key greeting and filtering requests and surfaces signed-key errors', async () => {
    const store = useModel()
    const vip = store.getModel(undefined, '生成招呼语', true)

    mockSignedKeyPost.mockResolvedValueOnce({
      data: {
        content: '你好，很高兴认识你',
        reasoning_content: 'reasoning',
        token_usage: {
          input_tokens: 8,
          output_tokens: 6,
          total_tokens: 14,
        },
      },
      error: null,
    })

    const greeting = await vip.message(
      {
        data: {
          card: createJobCard(),
          data: createJob(),
        },
      },
      'aiGreeting',
    )

    expect(greeting).toEqual(
      expect.objectContaining({
        content: '你好，很高兴认识你',
        usage: expect.objectContaining({ total_tokens: 14 }),
      }),
    )
    expect(mockSignedKeyPost).toHaveBeenCalledWith(
      '/v1/llm/invoke/greetings',
      expect.objectContaining({
        body: expect.objectContaining({ user_request: '生成招呼语' }),
      }),
    )

    mockSignedKeyReqHandler.mockImplementationOnce(() => '筛选失败')
    mockSignedKeyPost.mockResolvedValueOnce({ data: {}, error: null })
    await expect(
      vip.message(
        {
          amap: '通勤 20 分钟',
          data: {
            card: createJobCard(),
            data: createJob(),
          },
        },
        'aiFiltering',
      ),
    ).rejects.toThrow('筛选失败')

    mockSignedKeyReqHandler.mockImplementation((payload: { error?: string | null }) => payload.error ?? undefined)
    mockSignedKeyPost.mockResolvedValueOnce({ data: null, error: null })
    await expect(
      vip.message(
        {
          data: {
            card: createJobCard(),
            data: createJob(),
          },
        },
        'aiFiltering',
      ),
    ).rejects.toThrow('无LLM响应数据')

    await expect(
      vip.message(
        {
          data: {
            card: createJobCard(),
            data: createJob(),
          },
        },
        'aiReply',
      ),
    ).rejects.toThrow('无效的类型')
  })

  it('surfaces signed-key resume check failures', async () => {
    const store = useModel()
    const vip = store.getModel(undefined, '筛选岗位', true) as SignedKeyLLM

    mockSignedKeyGet.mockResolvedValueOnce({
      data: null,
      error: 'resume missing',
    })

    await expect(vip.checkResume()).rejects.toThrow('resume missing')
  })

  it('saveModel persists only non-vip models', async () => {
    const store = useModel()
    store.modelData = [
      createModelItem({
        key: 'normal',
        name: 'Normal',
        data: {
          advanced: {},
          api_key: 'secret',
          model: 'gpt-4o-mini',
          mode: 'openai',
          other: {},
          url: 'https://api.example.com',
        },
      }),
      {
        key: 'vip',
        name: 'VIP',
        vip: {
          description: 'vip',
          price: {
            input: '1',
            output: '1',
          },
        },
      },
    ]

    await store.saveModel()

    expect(await import('@/message').then((mod) => mod.counter.storageGet('session:conf-model'))).toEqual([
      expect.objectContaining({ key: 'normal' }),
    ])
  })
})
