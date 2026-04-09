import { setActiveSelectorRegistry, zhipinSelectors } from '@/utils/selectors'

import type { SiteAdapter } from './type'
import { createZhipinAdapter } from './zhipin/adapter'

const siteAdapters = [createZhipinAdapter()] satisfies SiteAdapter[]

let activeSiteAdapter = siteAdapters[0]

export function getSiteAdapters() {
  return [...siteAdapters]
}

export function isSupportedSiteUrl(url?: string | null) {
  if (!url) {
    return false
  }

  return siteAdapters.some((adapter) => adapter.matches(url))
}

export function getSiteAdapterByUrl(url?: string) {
  if (!url || isSupportedSiteUrl(url)) {
    return siteAdapters.find((adapter) => adapter.matches(url)) ?? activeSiteAdapter
  }
  return activeSiteAdapter
}

export function setActiveSiteAdapter(adapter: SiteAdapter) {
  activeSiteAdapter = adapter
  setActiveSelectorRegistry(adapter.getSelectors())
  return activeSiteAdapter
}

export function getActiveSiteAdapter(url?: string) {
  if (url) {
    return setActiveSiteAdapter(getSiteAdapterByUrl(url))
  }
  return activeSiteAdapter
}

setActiveSelectorRegistry(zhipinSelectors)
