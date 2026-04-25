import type { modelData } from '@/composables/useModel'
import type { Llm, MessageResponse } from '@/composables/useModel/type'
import type { logData } from '@/stores/log'

import { recordAIUsage } from './usageTracker'

function unwrapCodeFence(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/)
  return (match?.[1] ?? trimmed).trim()
}

function unwrapOuterQuotes(value: string) {
  const trimmed = value.trim()
  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
  ]

  for (const [start, end] of quotePairs) {
    if (trimmed.startsWith(start) && trimmed.endsWith(end)) {
      return trimmed.slice(start.length, -end.length).trim()
    }
  }

  return trimmed
}

export function normalizeAIGreetingContent(value: string) {
  return unwrapOuterQuotes(unwrapCodeFence(value))
}

export async function runInternalAIGreeting(options: {
  card: bossZpCardData
  ctx: logData
  gpt: Llm
  model?: Pick<modelData, 'data'>
  onPrompt: (s: string) => void
}) {
  const response = (await options.gpt.message(
    {
      data: {
        data: options.ctx.listData,
        boss: options.ctx.bossData,
        card: options.card,
        amap: {
          straightDistance: 0,
          drivingDistance: 0,
          drivingDuration: 0,
          walkingDistance: 0,
          walkingDuration: 0,
        },
      },
      onPrompt: options.onPrompt,
    },
    'aiGreeting',
  )) as MessageResponse

  recordAIUsage(response.usage, options.model)

  options.ctx.aiGreetingQ = response.prompt
  options.ctx.aiGreetingR = response.reasoning_content

  const message = typeof response.content === 'string' ? normalizeAIGreetingContent(response.content) : ''
  if (!message) {
    throw new Error('AI打招呼未返回有效内容')
  }

  return message
}
