import { isBossHelperSupportedJobUrl, type BossHelperAgentNavigatePayload } from '@/message/agent'

export function buildBossHelperNavigateUrl(
  payload: BossHelperAgentNavigatePayload | undefined,
  currentUrl: string,
  origin: string,
) {
  if (payload?.url) {
    const targetUrl = new URL(payload.url, origin)
    if (!isBossHelperSupportedJobUrl(targetUrl.toString())) {
      throw new Error('navigate.url 必须指向 Boss 职位搜索页')
    }
    return targetUrl.toString()
  }

  const targetUrl = new URL(currentUrl)
  if (payload?.query != null) {
    if (payload.query.trim()) {
      targetUrl.searchParams.set('query', payload.query.trim())
    } else {
      targetUrl.searchParams.delete('query')
    }
  }
  if (payload?.city != null) {
    if (payload.city.trim()) {
      targetUrl.searchParams.set('city', payload.city.trim())
    } else {
      targetUrl.searchParams.delete('city')
    }
  }
  if (payload?.position != null) {
    if (payload.position.trim()) {
      targetUrl.searchParams.set('position', payload.position.trim())
    } else {
      targetUrl.searchParams.delete('position')
    }
  }
  if (payload?.page != null) {
    if (!Number.isInteger(payload.page) || payload.page < 1) {
      throw new Error('navigate.page 必须是大于等于 1 的整数')
    }
    if (payload.page === 1) {
      targetUrl.searchParams.delete('page')
    } else {
      targetUrl.searchParams.set('page', String(payload.page))
    }
  }

  return targetUrl.toString()
}