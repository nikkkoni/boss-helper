export const sameCompanyKey = 'local:sameCompany'
export const sameHrKey = 'local:sameHr'

export {
  getBossToken,
  requestCard,
  requestDetail,
  sendPublishReq,
} from './zhipinApi'
export { rangeMatch, rangeMatchFormat } from './rangeMatch'

import { parseGptJson } from '@/utils/parse'

export function parseFiltering(content: string) {
  interface Item {
    reason: string
    score: number
  }

  const res = parseGptJson<{
    negative: Item[]
    positive: Item[]
  }>(content)

  const hand = (acc: { score: number; reason: string }, curr: Item) => ({
    score: acc.score + Math.abs(curr.score),
    reason: `${acc.reason}\n${curr.reason}/(${Math.abs(curr.score)}分)`,
  })
  const data = {
    negative: res?.negative?.reduce(hand, { score: 0, reason: '' }),
    positive: res?.positive?.reduce(hand, { score: 0, reason: '' }),
  }

  const rating = (data?.positive?.score ?? 0) - (data?.negative?.score ?? 0)
  const message = `分数${rating}\n消极:${data?.negative?.reason}\n\n积极:${data?.positive?.reason}`

  return { res, message, rating, data }
}

export function errorHandle(e: unknown): string {
  if (e instanceof Error) {
    return e.message
  }
  return `${e}`
}
