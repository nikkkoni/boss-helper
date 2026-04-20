import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { modelData } from '@/composables/useModel'

import { createJob, createJobCard } from './helpers/jobs'
import { setupPinia } from './helpers/pinia'
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

const { mockLoggerWarn, mockRequestPost, mockRunBatchedAIRequest, mockRunLimitedAIRequest } =
  vi.hoisted(() => ({
    mockLoggerWarn: vi.fn(),
    mockRequestPost: vi.fn(),
    mockRunBatchedAIRequest: vi.fn(async (_key: string, task: () => unknown) => task()),
    mockRunLimitedAIRequest: vi.fn(async (task: () => unknown) => task()),
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

import { sortModelEntries, useModel } from '@/composables/useModel'
import { Llm } from '@/composables/useModel/type'
import { RequestError } from '@/utils/request'

class TestLLM extends Llm<Record<string, never>> {
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
  })

  it('builds prompts for string and multi-turn templates', () => {
    const single = new TestLLM({}, '你好 {{ data.jobName }}')
    expect(single.buildPrompt({ data: createJob({ jobName: '前端工程师' }) })).toEqual([
      {
        content: '你好 前端工程师',
        role: 'user',
      },
    ])

    const multi = new TestLLM({}, [
      { content: '系统提示', role: 'system' },
      { content: '岗位 {{ data.jobName }}', role: 'user' },
    ])
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

  it('replaces persisted models on repeated init without duplicating entries', async () => {
    __setStorageItem('local:conf-model', [
      createModelItem({ key: 'persisted', name: 'Persisted model' }),
    ])

    const store = useModel()
    await store.initModel()
    await store.initModel()

    expect(store.modelData).toEqual([expect.objectContaining({ key: 'persisted' })])
  })

  it('returns a copied model list without mutating the source array', () => {
    const original = [
      createModelItem({ key: 'standard', name: 'Standard' }),
      createModelItem({ key: 'backup', name: 'Backup' }),
    ]

    const sorted = sortModelEntries(original)

    expect(sorted).not.toBe(original)
    expect(sorted.map((item) => item.key)).toEqual(['standard', 'backup'])
    expect(original.map((item) => item.key)).toEqual(['standard', 'backup'])
  })

  it('throws when the selected model is missing', () => {
    const store = useModel()
    expect(() => store.getModel(undefined, 'test prompt')).toThrow('GPT数据不存在')
  })

  it('builds an OpenAI model and retries retryable request errors', async () => {
    const store = useModel()
    const llm = store.getModel(
      createModelItem({
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
    expect(mockRequestPost).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        timeout: 1800 * 1000,
      }),
    )
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
    ) as Llm

    mockRequestPost.mockImplementationOnce(
      async ({
        onStream,
      }: {
        onStream?: (reader: AsyncIterable<{ data?: string }>) => Promise<void>
      }) => {
        await onStream?.(
          (async function* () {
            yield { data: '{"choices":[{"delta":{"content":"Hello"}}]}' }
            yield { data: '{"choices":[{"delta":{"content":" world"}}]}' }
            yield { data: '[DONE]' }
          })(),
        )

        return {
          choices: [],
        }
      },
    )

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

    expect(response.content).toBe('Hello world')
    expect(response.usage).toBeUndefined()
  })

  it('does not mutate choices when reading OpenAI chat responses', async () => {
    const store = useModel()
    const openaiModel = store.getModel(
      createModelItem({
        data: {
          advanced: {},
          api_key: 'secret',
          model: 'gpt-4o-mini',
          mode: 'openai',
          other: {},
          url: 'https://api.example.com/v1/chat/completions',
        },
      }),
      '你好 {{ data.jobName }}',
    ) as Llm

    const choices = [
      {
        message: {
          content: 'final answer',
        },
      },
    ]
    mockRequestPost.mockResolvedValueOnce({ choices })

    await expect(openaiModel.chat('hello')).resolves.toBe('final answer')
    expect(choices).toHaveLength(1)
  })

  it('returns empty OpenAI content safely when choices are missing', async () => {
    const store = useModel()
    const openaiModel = store.getModel(
      createModelItem({
        data: {
          advanced: {},
          api_key: 'secret',
          model: 'gpt-4o-mini',
          mode: 'openai',
          other: {},
          url: 'https://api.example.com/v1/chat/completions',
        },
      }),
      '你好 {{ data.jobName }}',
    ) as Llm

    mockRequestPost.mockResolvedValueOnce({ choices: undefined })

    await expect(openaiModel.chat('hello')).resolves.toBe('')
  })

  it('saveModel persists configured models', async () => {
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
    ]

    await store.saveModel()

    expect(
      await import('@/message').then((mod) => mod.counter.storageGet('local:conf-model')),
    ).toEqual([expect.objectContaining({ key: 'normal' })])
  })

  it('migrates session model storage into persistent local storage on init', async () => {
    __setStorageItem('session:conf-model', [
      createModelItem({ key: 'session-model', name: 'Session Model' }),
    ])

    const store = useModel()
    await store.initModel()

    expect(store.modelData).toEqual([expect.objectContaining({ key: 'session-model' })])
    expect(
      await import('@/message').then((mod) => mod.counter.storageGet('local:conf-model')),
    ).toEqual([expect.objectContaining({ key: 'session-model' })])
  })
})
