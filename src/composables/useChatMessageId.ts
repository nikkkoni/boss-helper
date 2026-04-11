import { createMonotonicIdGenerator } from '@/utils/monotonicId'

const nextChatMessageId = createMonotonicIdGenerator()

export function nextChatId(seed?: number) {
  return nextChatMessageId(seed)
}
