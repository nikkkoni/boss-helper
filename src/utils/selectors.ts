export type ZhipinRouteKind = 'job' | 'job-recommend' | 'jobs' | 'unknown'

export interface SelectorRegistry<RouteKind extends string = string> {
  cleanup: readonly string[]
  extension: {
    appRoot: string
    appRootId: string
    jobPanel: string
    jobPanelId: string
    jobPanelWrap: string
    jobPanelWrapId: string
  }
  getRouteKind: (pathname?: string) => RouteKind | 'unknown'
  mountContainers: Record<RouteKind | 'all', readonly string[]>
  root: string
  searchLayout: Record<string, string | readonly string[]>
  siteId: string
  supportedPaths: readonly string[]
  vueContainers: Record<RouteKind | 'all', readonly string[]>
}

export type SelectorHealthMode = 'all' | 'any'

export type SelectorHealthExpectation = {
  label: string
  mode: SelectorHealthMode
  selectors: readonly string[]
}

export type SelectorHealthResult = SelectorHealthExpectation & {
  matchedSelectors: string[]
  missingSelectors: string[]
  ok: boolean
}

export const DOM_READY_TIMEOUT_MS = 15_000
export const SELECTOR_TIMEOUT_MS = 15_000
export const SELECTOR_RETRY_INTERVAL_MS = 150

export const zhipinSelectors: SelectorRegistry<Exclude<ZhipinRouteKind, 'unknown'>> = {
  siteId: 'zhipin',
  supportedPaths: ['/web/geek/job', '/web/geek/job-recommend', '/web/geek/jobs'],
  root: '#wrap',
  extension: {
    appRoot: '#boss-helper',
    appRootId: 'boss-helper',
    jobPanel: '#boss-helper-job',
    jobPanelId: 'boss-helper-job',
    jobPanelWrap: '#boss-helper-job-warp',
    jobPanelWrapId: 'boss-helper-job-warp',
  },
  mountContainers: {
    job: ['.job-search-wrapper'],
    'job-recommend': ['.job-recommend-main'],
    jobs: ['.page-jobs .page-jobs-main', '.page-jobs-main'],
    all: ['.job-search-wrapper', '.job-recommend-main', '.page-jobs .page-jobs-main', '.page-jobs-main'],
  },
  vueContainers: {
    job: ['#wrap .page-job-wrapper'],
    'job-recommend': ['.job-recommend-main'],
    jobs: ['.page-jobs-main'],
    all: ['#wrap .page-job-wrapper', '.job-recommend-main', '.page-jobs-main'],
  },
  searchLayout: {
    recommendSearch: '.job-recommend-search',
    legacyBlocks: [
      '.job-search-wrapper .job-search-box.clearfix',
      '.job-search-wrapper .search-condition-wrapper.clearfix',
    ],
    jobsBlocks: ['.page-jobs-main .expect-and-search', '.page-jobs-main .filter-condition'],
    jobsInputs: ['.c-search-input', '.c-expect-select'],
    legacyScan: '.job-search-scan',
  },
  cleanup: [
    '.job-list-wrapper .subscribe-weixin-wrapper',
    '.job-side-wrapper',
    '.side-bar-box',
    '.go-login-btn',
    '.c-subscribe-weixin',
    '.c-job-tools.job-tools',
    '.c-hot-link.hot-link',
    '.c-breadcrumb',
  ],
  getRouteKind: (pathname = location.pathname) => getZhipinRouteKind(pathname),
} as const

let activeSelectorRegistry: SelectorRegistry = zhipinSelectors

export function setActiveSelectorRegistry(registry: SelectorRegistry) {
  activeSelectorRegistry = registry
}

export function getActiveSelectorRegistry() {
  return activeSelectorRegistry
}

export function splitSelectors(selectors: string | readonly string[]): string[] {
  if (typeof selectors !== 'string') {
    return [...selectors]
  }
  return selectors
    .split(',')
    .map((selector: string) => selector.trim())
    .filter(Boolean)
}

export function joinSelectors(selectors: readonly string[]) {
  return selectors.join(',')
}

export function getZhipinRouteKind(pathname = location.pathname): ZhipinRouteKind {
  switch (pathname) {
    case '/web/geek/job':
      return 'job'
    case '/web/geek/job-recommend':
      return 'job-recommend'
    case '/web/geek/jobs':
      return 'jobs'
    default:
      return 'unknown'
  }
}

export function isSupportedZhipinRoute(pathname = location.pathname) {
  return getZhipinRouteKind(pathname) !== 'unknown'
}

export function getMountContainerSelectors(
  pathname = location.pathname,
  registry: SelectorRegistry = getActiveSelectorRegistry(),
) {
  const routeKind = registry.getRouteKind(pathname)
  if (routeKind === 'unknown') {
    return registry.mountContainers.all
  }
  return registry.mountContainers[routeKind]
}

export function getVueContainerSelectors(
  pathname = location.pathname,
  registry: SelectorRegistry = getActiveSelectorRegistry(),
) {
  const routeKind = registry.getRouteKind(pathname)
  if (routeKind === 'unknown') {
    return registry.vueContainers.all
  }
  return registry.vueContainers[routeKind]
}

export async function waitForDocumentReady(timeoutMs = DOM_READY_TIMEOUT_MS) {
  if (document.readyState !== 'loading') {
    return
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      document.removeEventListener('DOMContentLoaded', onReady)
      clearTimeout(timeoutId)
    }

    const finish = (callback: () => void) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      callback()
    }

    const onReady = () => {
      finish(resolve)
    }

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error(`等待文档就绪超时 (${timeoutMs}ms)`)))
    }, timeoutMs)

    document.addEventListener('DOMContentLoaded', onReady, { once: true })
  })
}

export function getSelectorHealthExpectations(
  pathname = location.pathname,
  registry: SelectorRegistry = getActiveSelectorRegistry(),
): SelectorHealthExpectation[] {
  if (registry.getRouteKind(pathname) === 'unknown') {
    return []
  }

  return [
    {
      label: 'root',
      mode: 'all',
      selectors: [registry.root],
    },
    {
      label: 'mount-container',
      mode: 'any',
      selectors: getMountContainerSelectors(pathname, registry),
    },
    {
      label: 'vue-container',
      mode: 'any',
      selectors: getVueContainerSelectors(pathname, registry),
    },
  ]
}

export function collectSelectorHealth(
  pathname = location.pathname,
  root: Pick<ParentNode, 'querySelector'> = document,
  registry: SelectorRegistry = getActiveSelectorRegistry(),
) {
  return getSelectorHealthExpectations(pathname, registry).map((expectation) => {
    const matchedSelectors = expectation.selectors.filter((selector) => Boolean(root.querySelector(selector)))
    return {
      ...expectation,
      matchedSelectors,
      missingSelectors: expectation.selectors.filter((selector) => !matchedSelectors.includes(selector)),
      ok:
        expectation.mode === 'all'
          ? matchedSelectors.length === expectation.selectors.length
          : matchedSelectors.length > 0,
    } satisfies SelectorHealthResult
  })
}

export function formatSelectorHealth(results: readonly SelectorHealthResult[]) {
  if (!results.length) {
    return 'no selector checks'
  }

  return results
    .map((result) => {
      const matched = result.matchedSelectors.join(' | ') || 'none'
      const missing = result.missingSelectors.join(' | ') || 'none'
      return `${result.label}=${result.ok ? 'ok' : 'missing'} matched:[${matched}] missing:[${missing}]`
    })
    .join('; ')
}
