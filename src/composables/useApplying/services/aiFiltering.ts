import type { modelData } from '@/composables/useModel'
import type { Llm, MessageResponse } from '@/composables/useModel/type'
import type { logData } from '@/stores/log'
import { AIFilteringError } from '@/types/deliverError'
import { parseStructuredJson } from '@/utils/parse'

import { recordAIUsage } from './usageTracker'

const filteringStructuredSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['negative', 'positive'],
  properties: {
    negative: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['reason', 'score'],
        properties: {
          reason: { type: 'string' },
          score: { type: 'number' },
        },
      },
    },
    positive: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['reason', 'score'],
        properties: {
          reason: { type: 'string' },
          score: { type: 'number' },
        },
      },
    },
  },
} as const

type FilteringItem = {
  reason: string
  score: number
}

type FilteringResult = {
  negative: FilteringItem[]
  positive: FilteringItem[]
}

export function summarizeFilteringResult(result: Partial<FilteringResult> | null | undefined) {
  const hand = (acc: { score: number; reason: string }, curr: FilteringItem) => ({
    score: acc.score + Math.abs(curr.score),
    reason: `${acc.reason}\n${curr.reason}/(${Math.abs(curr.score)}分)`,
  })
  const data = {
    negative: result?.negative?.reduce(hand, { score: 0, reason: '' }),
    positive: result?.positive?.reduce(hand, { score: 0, reason: '' }),
  }

  const rating = (data.positive?.score ?? 0) - (data.negative?.score ?? 0)
  const message = `分数${rating}\n消极:${data.negative?.reason ?? ''}\n\n积极:${data.positive?.reason ?? ''}`
  return { data, message, rating }
}

export async function runInternalAIFiltering(options: {
  ctx: logData
  gpt: Llm
  model?: Pick<modelData, 'data'>
  onPrompt: (s: string) => void
  threshold: number
}) {
  const response = (await options.gpt.message(
    {
      data: {
        data: options.ctx.listData,
        boss: options.ctx.bossData,
        card: options.ctx.listData.card!,
        amap: {
          straightDistance: 0,
          drivingDistance: 0,
          drivingDuration: 0,
          walkingDistance: 0,
          walkingDuration: 0,
        },
      },
      json: true,
      structuredOutput: {
        name: 'boss_helper_ai_filtering',
        schema: filteringStructuredSchema as unknown as Record<string, unknown>,
      },
      onPrompt: options.onPrompt,
    },
    'aiFiltering',
  )) as MessageResponse<FilteringResult | string>

  recordAIUsage(response.usage, options.model)

  options.ctx.aiFilteringQ = response.prompt
  if (response.content == null) {
    throw new Error('AI筛选未返回有效内容')
  }

  const res =
    typeof response.content === 'string'
      ? parseStructuredJson<FilteringResult>(response.content)
      : response.content
  const { message, rating } = summarizeFilteringResult(res)

  options.ctx.aiFilteringAjson = res || {}
  options.ctx.aiFilteringAtext = message
  options.ctx.aiFilteringR = response.reasoning_content
  options.ctx.aiFilteringScore = {
    accepted: rating >= options.threshold,
    negative: res?.negative ?? [],
    positive: res?.positive ?? [],
    rating,
    reason: message,
    source: 'internal',
    threshold: options.threshold,
  }

  if (rating < options.threshold) {
    throw new AIFilteringError(message, {
      accepted: false,
      negative: res?.negative ?? [],
      positive: res?.positive ?? [],
      rating,
      reason: message,
      source: 'internal',
      threshold: options.threshold,
    })
  }
}
