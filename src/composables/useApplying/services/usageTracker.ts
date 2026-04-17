import type { modelData } from '@/composables/useModel'
import type { MessageResponse } from '@/composables/useModel/type'
import { useStatistics } from '@/stores/statistics'

export function calculateUsageCost(
  usage: NonNullable<MessageResponse['usage']> | undefined,
  model?: Pick<modelData, 'data'>,
) {
  if (!usage || !model?.data) {
    return 0
  }

  const inputRate = Number(model.data.other.pricingInputPerMillion ?? 0)
  const outputRate = Number(model.data.other.pricingOutputPerMillion ?? 0)

  if (inputRate <= 0 && outputRate <= 0) {
    return 0
  }

  return (
    ((usage.input_tokens ?? 0) / 1_000_000) * inputRate +
    ((usage.output_tokens ?? 0) / 1_000_000) * outputRate
  )
}

export function recordAIUsage(
  usage: NonNullable<MessageResponse['usage']> | undefined,
  model?: Pick<modelData, 'data'>,
) {
  if (!usage) {
    return 0
  }

  const statistics = useStatistics()
  statistics.todayData.aiRequestCount = (statistics.todayData.aiRequestCount ?? 0) + 1
  statistics.todayData.aiInputTokens =
    (statistics.todayData.aiInputTokens ?? 0) + (usage.input_tokens ?? 0)
  statistics.todayData.aiOutputTokens =
    (statistics.todayData.aiOutputTokens ?? 0) + (usage.output_tokens ?? 0)
  statistics.todayData.aiTotalTokens =
    (statistics.todayData.aiTotalTokens ?? 0) + (usage.total_tokens ?? 0)

  const cost = calculateUsageCost(usage, model)
  statistics.todayData.aiTotalCost = Number(
    ((statistics.todayData.aiTotalCost ?? 0) + cost).toFixed(6),
  )
  return cost
}
