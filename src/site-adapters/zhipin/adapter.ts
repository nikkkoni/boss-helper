import type { BossHelperAgentNavigatePayload } from '@/message/agent'
import type { MyJobListData } from '@/stores/jobs'
import { getZhipinRouteKind, zhipinSelectors } from '@/utils/selectors'

import { sendPublishReq } from '@/composables/useApplying/utils'

import type { SiteAdapter } from '../type'

function buildZhipinNavigateUrl(
  payload: BossHelperAgentNavigatePayload | undefined,
  currentUrl: string,
  origin: string,
) {
  if (payload?.url) {
    const targetUrl = new URL(payload.url, origin)
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      throw new Error('navigate.url 协议不合法')
    }
    if (targetUrl.origin !== origin) {
      throw new Error('navigate.url 必须与当前站点同源')
    }
    if (!zhipinSelectors.supportedPaths.some((path) => targetUrl.pathname === path || targetUrl.pathname.startsWith(`${path}/`))) {
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

function toZhipinJobCard(detail: bossZpDetailData): NonNullable<MyJobListData['card']> {
  return {
    ...detail,
    jobName: detail.jobInfo.jobName,
    postDescription: detail.jobInfo.postDescription,
    encryptJobId: detail.jobInfo.encryptId,
    atsDirectPost: false,
    atsProxyJob: detail.jobInfo.proxyJob === 1,
    salaryDesc: detail.jobInfo.salaryDesc,
    cityName: detail.jobInfo.locationName,
    experienceName: detail.jobInfo.experienceName,
    degreeName: detail.jobInfo.degreeName,
    jobLabels: detail.jobInfo.showSkills || [],
    address: detail.jobInfo.address,
    lid: detail.lid,
    sessionId: detail.sessionId || '',
    securityId: detail.securityId,
    encryptUserId: detail.jobInfo.encryptUserId,
    bossName: detail.bossInfo.name,
    bossTitle: detail.bossInfo.title,
    bossAvatar: detail.bossInfo.tiny,
    online: detail.bossInfo.bossOnline,
    certificated: detail.bossInfo.certificated,
    activeTimeDesc: detail.bossInfo.activeTimeDesc,
    brandName: detail.brandComInfo.brandName,
    canAddFriend: true,
    friendStatus: 0,
    isInterested: detail.relationInfo.interestJob ? 1 : 0,
    login: true,
  }
}

export function createZhipinAdapter(): SiteAdapter<bossZpJobItemData, bossZpDetailData> {
  const adapter: SiteAdapter<bossZpJobItemData, bossZpDetailData> = {
    id: 'zhipin',
    matches(url = location.href) {
      try {
        const { pathname } = new URL(url)
        return zhipinSelectors.supportedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
      } catch {
        return false
      }
    },
    getSelectors() {
      return zhipinSelectors
    },
    buildNavigateUrl(payload, currentUrl, origin) {
      return buildZhipinNavigateUrl(payload, currentUrl, origin)
    },
    getVueBindings() {
      return {
        clickJobCardActionKey: 'clickJobCardAction',
        jobDetailKey: 'jobDetail',
        jobListKey: 'jobList',
      }
    },
    getPagerBindings(pathname = location.pathname) {
      const routeKind = getZhipinRouteKind(pathname)
      const useSearchAction = routeKind === 'job-recommend' || routeKind === 'jobs'
      return {
        pageChangeMethodKeys: useSearchAction ? ['searchJobAction', 'onSearch'] : ['pageChangeAction'],
        pageChangeSelectorKey: useSearchAction ? 'all' : 'job',
        pageStateKey: 'pageVo',
        pageStateSelectorKey: 'all',
      }
    },
    getSearchPanelPlan(pathname = location.pathname) {
      const routeKind = getZhipinRouteKind(pathname)
      if (routeKind === 'job-recommend') {
        return {
          kind: 'recommend',
          searchSelector: zhipinSelectors.searchLayout.recommendSearch as string,
        }
      }
      if (routeKind === 'jobs') {
        return {
          kind: 'jobs',
          blockSelectors: zhipinSelectors.searchLayout.jobsBlocks as readonly string[],
          inputSelectors: zhipinSelectors.searchLayout.jobsInputs as readonly string[],
        }
      }
      return {
        kind: 'legacy',
        blockSelectors: zhipinSelectors.searchLayout.legacyBlocks as readonly string[],
        scanSelector: zhipinSelectors.searchLayout.legacyScan as string,
      }
    },
    async loadPageModule() {
      return import('@/pages/zhipin')
    },
    applyToJob(job) {
      return sendPublishReq(job)
    },
    navigatePage({ direction, page, pageChange }) {
      if (!pageChange) {
        return false
      }

      if (direction === 'prev' && page.page <= 1) {
        return false
      }

      pageChange(direction === 'next' ? page.page + 1 : page.page - 1)
      return true
    },
    parseJobDetail(detail) {
      return toZhipinJobCard(detail)
    },
    parseJobList(items, options) {
      const currentJobs = new Map(options.currentJobs.map((item) => [item.encryptJobId, item]))

      return items.map((item) => {
        const existing = currentJobs.get(item.encryptJobId)
        if (existing) {
          Object.assign(existing, item)
          return existing
        }

        const cached = options.getCachedResult(item.encryptJobId)

        return {
          ...item,
          status: options.createStatus(item.encryptJobId, cached),
          getCard: async () => {
            const detail = await options.loadJobDetail(item)
            const card = adapter.parseJobDetail(detail)
            options.onCardLoaded(item.encryptJobId, card)
            return card
          },
        }
      })
    },
    shouldStopOnRepeatedJobList(pathname = location.pathname) {
      const routeKind = getZhipinRouteKind(pathname)
      return routeKind === 'job-recommend' || routeKind === 'jobs'
    },
  }

  return adapter
}
