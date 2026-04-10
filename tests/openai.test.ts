import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createJob } from './helpers/jobs'

const {
  mockLoggerWarn,
  mockRequestPost,
  mockRunBatchedAIRequest,
} = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
  mockRequestPost: vi.fn(),
  mockRunBatchedAIRequest: vi.fn(async (_key: string, task: () => unknown) => task()),
}))

vi.mock('@/utils/concurrency', () => ({
  runBatchedAIRequest: mockRunBatchedAIRequest,
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

import { openai } from '@/composables/useModel/openai'
import { RequestError } from '@/utils/request'

const createConf = () => ({
  advanced: {
    json: true,
    stream: false,
  },
  api_key: 'secret',
  model: 'gpt-4o-mini',
  mode: 'openai' as const,
  other: {},
  url: 'https://api.example.com/v1/chat/completions',
})

describe('openai llm', () => {
  beforeEach(() => {
    mockLoggerWarn.mockReset()
    mockRequestPost.mockReset()
    mockRunBatchedAIRequest.mockClear()
  })

  it('falls back from structured output to json_object when the provider rejects json_schema', async () => {
    const model = new openai.Gpt(createConf(), '你好 {{ data.jobName }}')
    const schemaUnsupportedError = new RequestError('response_format json_schema is not supported here')
    schemaUnsupportedError.statusCode = 400

    mockRequestPost
      .mockRejectedValueOnce(schemaUnsupportedError)
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '{"accepted":true}',
            },
          },
        ],
      })

    const response = await model.message(
      {
        data: {
          data: createJob({ jobName: '前端工程师' }),
        },
        json: true,
        structuredOutput: {
          name: 'job_review',
          schema: {
            type: 'object',
          },
        },
      },
      'aiFiltering',
    )

    expect(mockRequestPost).toHaveBeenCalledTimes(2)
    expect(mockRequestPost.mock.calls[0]?.[0]?.data).toContain('"type":"json_schema"')
    expect(mockRequestPost.mock.calls[1]?.[0]?.data).toContain('"type":"json_object"')
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'AI structured output 不可用，回退到 json_object',
      expect.objectContaining({
        model: 'gpt-4o-mini',
      }),
    )
    expect(response.content).toEqual({ accepted: true })
  })

  it('parses streaming chunks while ignoring malformed frames', async () => {
    const model = new openai.Gpt(
      {
        ...createConf(),
        advanced: {
          json: false,
          stream: true,
        },
      },
      '你好 {{ data.jobName }}',
    )

    mockRequestPost.mockImplementationOnce(
      async ({ onStream }: { onStream?: (reader: AsyncIterable<{ data?: string }>) => Promise<void> }) => {
        await onStream?.((async function* () {
          yield { data: '{"choices":[{"delta":{"content":"Hello"}}]}' }
          yield { data: 'not-json' }
          yield { data: '{"choices":[{"delta":{"content":" world"}}]}' }
          yield { data: '[DONE]' }
        })())

        return {
          choices: [],
        }
      },
    )

    const response = await model.message(
      {
        data: {
          data: createJob({ jobName: '前端工程师' }),
        },
      },
      'aiFiltering',
    )

    expect(response.content).toBe('Hello world')
    expect(response.usage).toBeUndefined()
  })
})
