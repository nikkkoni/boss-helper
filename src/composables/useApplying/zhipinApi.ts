import { ElMessage } from 'element-plus'

import { browser } from '#imports'
import {
  BossHelperError,
  LimitError,
  PublishError,
  RateLimitError,
  UnknownError,
} from '@/types/deliverError'
import { logger } from '@/utils/logger'

import { runWithZhipinRateLimit } from './services/zhipinRateLimit'

interface BossApiResponse<T> {
  code: number
  message: string
  zpData: T
}

type AxiosClient = typeof import('axios')['default']

let axiosClientPromise: Promise<AxiosClient> | null = null

async function getAxiosClient() {
  axiosClientPromise ??= import('axios').then((module) => module.default)
  return axiosClientPromise
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : `${error}`
}

export async function getBossToken() {
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
  const axios = await getAxiosClient()
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
  const axios = await getAxiosClient()
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
  params: Record<string, unknown> = {},
) {
  const axios = await getAxiosClient()
  if (retries === 0) {
    throw new PublishError(errorMsg ?? '重试多次失败')
  }

  const url = 'https://www.zhipin.com/wapi/zpgeek/friend/add.json'
  const token = await getBossToken()
  try {
    const res = await runWithZhipinRateLimit(() =>
      axios({
        url,
        params: {
          securityId: data.securityId,
          jobId: data.encryptJobId,
          ...params,
        },
        method: 'POST',
        headers: { Zp_token: token },
      }),
    )

    res.data.code !== 0 && logger.error('投递失败', res)

    if (res.data.code === 1) {
      const content = String(
        res.data?.zpData?.bizData?.chatRemindDialog?.content || res.data.message || '未知错误',
      )
      if (content.includes('您今天已与120位BOSS沟通')) {
        try {
          const confirmPayload = new URLSearchParams()
          confirmPayload.append('ba', res.data.zpData.bizData.chatRemindDialog.ba)
          confirmPayload.append('action', 'addf-limit-popup-c')
          await runWithZhipinRateLimit(() =>
            axios({
              url: 'https://www.zhipin.com/wapi/zpCommon/actionLog/geek/chatremind.json',
              method: 'POST',
              headers: { Zp_token: token },
              data: confirmPayload,
            }),
          )
          return sendPublishReq(data, undefined, retries - 1, { ...params, cid: 1 })
        } catch (error) {
          logger.error('尝试确认投递限制失败', error)
          throw new PublishError(`投递限制确认失败]${content}`)
        }
      }

      if (content.includes('您今天已与150位BOSS沟通')) {
        throw new LimitError(content)
      }
      if (content.includes('操作过于频繁')) {
        throw new RateLimitError(content)
      }

      throw new PublishError(content)
    }
    if (res.data.code !== 0) {
      throw new PublishError(`未知错误状态:${res.data.message}`)
    }
    return res.data
  } catch (error) {
    if (error instanceof BossHelperError) {
      throw error
    }
    logger.warn(`sendPublishReq 重试, 剩余 ${retries - 1} 次`, error)
    return sendPublishReq(data, toErrorMessage(error), retries - 1)
  }
}
