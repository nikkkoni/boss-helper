import axios from 'axios'
import { ElMessage } from 'element-plus'

import { browser } from '#imports'
import {
  BoosHelperError,
  GreetError,
  LimitError,
  PublishError,
  RateLimitError,
  UnknownError,
} from '@/types/deliverError'
import type { FormDataRange } from '@/types/formData'
import { logger } from '@/utils/logger'
import { parseGptJson } from '@/utils/parse'

import { runWithZhipinRateLimit } from './services/zhipinRateLimit'

// const { userInfo } = useStore()

export const sameCompanyKey = 'local:sameCompany'
export const sameHrKey = 'local:sameHr'

interface BossApiResponse<T> {
  code: number
  message: string
  zpData: T
}

async function getBossToken() {
  const pageToken = window?.Cookie?.get?.('bst')
  if (typeof pageToken === 'string' && pageToken) {
    return pageToken
  }

  const cookieToken = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('bst='))
    ?.slice(4)
  if (cookieToken) {
    return decodeURIComponent(cookieToken)
  }

  for (const url of ['https://www.zhipin.com', 'https://zhipin.com']) {
    const token = await browser.cookies?.get?.({
      url,
      name: 'bst',
    })
    if (token?.value) {
      return token.value
    }
  }

  ElMessage.error('没有获取到token,请刷新重试')
  throw new PublishError('没有获取到token')
}

function ensureBossApiSuccess<T>(response: BossApiResponse<T>, action: string): T {
  if (response.code !== 0) {
    throw new UnknownError(`${action}: ${response.message || '未知错误'}`)
  }

  return response.zpData
}

export async function requestCard(params: { securityId: string; lid: string }) {
  const res = await runWithZhipinRateLimit(() =>
    axios.get<
      BossApiResponse<{
        jobCard: bossZpCardData
      }>
    >('https://www.zhipin.com/wapi/zpgeek/job/card.json', {
      params,
      timeout: 5000,
    }),
  )

  return ensureBossApiSuccess(res.data, '获取职位卡片失败').jobCard
}

export async function requestDetail(params: { securityId: string; lid: string }) {
  const token = await getBossToken()
  const res = await runWithZhipinRateLimit(() =>
    axios.get<BossApiResponse<bossZpDetailData>>(
      'https://www.zhipin.com/wapi/zpgeek/job/detail.json',
      {
        params: {
          ...params,
          _: Date.now(),
        },
        headers: { Zp_token: token },
        timeout: 5000,
      },
    ),
  )

  return ensureBossApiSuccess(res.data, '获取职位详情失败')
}

export async function sendPublishReq(
  data: bossZpJobItemData,
  errorMsg?: string,
  retries = 3,
  _params = {},
) {
  if (retries === 0) {
    throw new PublishError(errorMsg ?? '重试多次失败')
  }
  const url = 'https://www.zhipin.com/wapi/zpgeek/friend/add.json'
  const params = {
    securityId: data.securityId,
    jobId: data.encryptJobId,
    ..._params,
  }
  const token = await getBossToken()
  try {
    const res = await runWithZhipinRateLimit(() =>
      axios({
        url,
        params,
        method: 'POST',
        headers: { Zp_token: token },
      }),
    )

    res.data.code !== 0 && logger.error(`投递失败`, res)

    if (res.data.code === 1) {
      const content = String(
        res.data?.zpData?.bizData?.chatRemindDialog?.content || res.data.message || '未知错误',
      )
      // 命中限额弹窗 → 立刻发送确认请求
      if (content.includes('您今天已与120位BOSS沟通')) {
        try {
          const params = new URLSearchParams()
          params.append('ba', res.data.zpData.bizData.chatRemindDialog.ba)
          params.append('action', 'addf-limit-popup-c')
          await runWithZhipinRateLimit(() =>
            axios({
              url: 'https://www.zhipin.com/wapi/zpCommon/actionLog/geek/chatremind.json',
              method: 'POST',
              headers: { Zp_token: token },
              data: params,
            }),
          )
          return sendPublishReq(data, undefined, retries - 1, { ..._params, cid: 1 })
        } catch (e) {
          logger.error('尝试确认投递限制失败', e)
          throw new PublishError(`投递限制确认失败]${content}`)
        }
      } else if (content.includes('您今天已与150位BOSS沟通')) {
        throw new LimitError(content)
      } else if (content.includes('操作过于频繁')) {
        throw new RateLimitError(content)
      }

      throw new PublishError(content)
    } else if (res.data.code !== 0) {
      throw new PublishError(`未知错误状态:${res.data.message}`)
    }
    return res.data
  } catch (e: unknown) {
    if (e instanceof BoosHelperError) {
      throw e
    }
    logger.warn(`sendPublishReq 重试, 剩余 ${retries - 1} 次`, e)
    return sendPublishReq(data, errorHandle(e), retries - 1)
  }
}

export async function requestBossData(
  card: bossZpCardData,
  errorMsg?: string,
  retries = 3,
): Promise<bossZpBossData> {
  if (retries === 0) {
    throw new GreetError(errorMsg ?? '重试多次失败')
  }
  const url = 'https://www.zhipin.com/wapi/zpchat/geek/getBossData'
  // userInfo.value?.token 不相等！
  const token = await getBossToken()
  try {
    const data = new FormData()
    data.append('bossId', card.encryptUserId)
    data.append('securityId', card.securityId)
    data.append('bossSrc', '0')
    const res = await runWithZhipinRateLimit(() =>
      axios<{
        code: number
        message: string
        zpData: bossZpBossData
      }>({
        url,
        data,
        method: 'POST',
        headers: { Zp_token: token },
      }),
    )
    if (res.data.code !== 0) {
      if (res.data.message === '非好友关系') {
        return await requestBossData(card, '非好友关系', retries - 1)
      }
      throw new GreetError(`状态错误:${res.data.message}`)
    }
    return res.data.zpData
  } catch (e: unknown) {
    if (e instanceof GreetError) {
      throw e
    }
    return requestBossData(card, errorHandle(e), retries - 1)
  }
}

export function rangeMatchFormat(v: FormDataRange, unit: string): string {
  return `${v[0]} - ${v[1]} ${unit} ${v[2] ? '严格' : '宽松'}`
}

// 匹配范围
export function rangeMatch(rangeStr: string, form: FormDataRange): boolean {
  if (!rangeStr) return false
  let [start, end, mode] = form // mode: true=严格(包含)，false=宽松(重叠)
  if (start > end) {
    ;[start, end] = [end, start]
  }
  const re = /(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/
  const m = String(rangeStr).match(re)
  if (!m) return false

  let inputStart = Number.parseFloat(m[1])
  let inputEnd = Number.parseFloat(m[2] != null ? m[2] : m[1])
  if (!Number.isFinite(inputStart) || !Number.isFinite(inputEnd)) return false

  if (inputStart > inputEnd) {
    ;[inputStart, inputEnd] = [inputEnd, inputStart]
  }
  // console.log({
  //     inputStart,inputEnd,start,end
  // })
  if (mode) {
    // 严格：职位范围(input) 完全覆盖 目标范围(form)
    return start <= inputStart && inputEnd <= end
  } else {
    // 宽松：任意重叠（闭区间）
    return Math.max(inputStart, start) <= Math.min(inputEnd, end)
  }
}

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
