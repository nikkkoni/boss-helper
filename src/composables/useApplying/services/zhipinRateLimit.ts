import { createMinIntervalGate } from '@/utils/retry'

const DEFAULT_ZHIPIN_MIN_INTERVAL_MS = 1_200

const zhipinRequestGate = createMinIntervalGate(DEFAULT_ZHIPIN_MIN_INTERVAL_MS)

export function runWithZhipinRateLimit<T>(task: () => Promise<T>) {
  return zhipinRequestGate.run(task)
}

export function getZhipinRateLimitGate() {
  return zhipinRequestGate
}
