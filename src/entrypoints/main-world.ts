/* c8 ignore file */
import { createPinia } from 'pinia'
import { createApp, type Component } from 'vue'

import { defineUnlistedScript } from '#imports'
import { getRootVue } from '@/composables/useVue'
import { initializeBossHelperWindowBridgeTargetFromRuntime } from '@/message/window'
import { getSiteAdapterByUrl, isSupportedSiteUrl, setActiveSiteAdapter } from '@/site-adapters'
import { loader } from '@/utils'
import { logger } from '@/utils/logger'
import {
  DOM_READY_TIMEOUT_MS,
  collectSelectorHealth,
  formatSelectorHealth,
  getActiveSelectorRegistry,
  waitForDocumentReady,
} from '@/utils/selectors'

const axiosLoaderKey = Symbol('boss-helper-axios-loader')

type AxiosLoaderStop = () => void
type AxiosLoaderCarrier = {
  timeout?: number | null
  [axiosLoaderKey]?: AxiosLoaderStop
}

type AxiosLoaderClient = {
  interceptors: {
    request: {
      use: (
        onFulfilled: (config: AxiosLoaderCarrier) => AxiosLoaderCarrier | Promise<AxiosLoaderCarrier>,
        onRejected?: (error: { config?: AxiosLoaderCarrier } | unknown) => Promise<never>,
      ) => unknown
    }
    response: {
      use: (
        onFulfilled: (response: { config: AxiosLoaderCarrier }) => unknown,
        onRejected?: (error: { config?: AxiosLoaderCarrier } | unknown) => Promise<never>,
      ) => unknown
    }
  }
}

function attachAxiosLoader(config: AxiosLoaderCarrier) {
  if (typeof config.timeout === 'number' && Number.isFinite(config.timeout) && config.timeout > 0) {
    config[axiosLoaderKey] = loader({ ms: config.timeout, color: '#F79E63' })
    return
  }

  config[axiosLoaderKey] = () => {}
}

function clearAxiosLoader(config?: AxiosLoaderCarrier | null) {
  if (!config) {
    return
  }

  const stop = config[axiosLoaderKey]
  delete config[axiosLoaderKey]
  stop?.()
}

export function installAxiosLoaderInterceptors(client: AxiosLoaderClient) {
  client.interceptors.request.use(
    (config) => {
      attachAxiosLoader(config)
      return config
    },
    async (error: { config?: AxiosLoaderCarrier } | unknown) => {
      clearAxiosLoader((error as { config?: AxiosLoaderCarrier } | undefined)?.config)
      return Promise.reject(error)
    },
  )

  client.interceptors.response.use(
    (response) => {
      clearAxiosLoader(response.config)
      return response
    },
    async (error: { config?: AxiosLoaderCarrier } | unknown) => {
      clearAxiosLoader((error as { config?: AxiosLoaderCarrier } | undefined)?.config)
      return Promise.reject(error)
    },
  )
}

function reportSelectorHealth(stage: string, pathname = location.pathname) {
  if (!isSupportedSiteUrl(new URL(pathname, location.origin).toString())) {
    return
  }

  const results = collectSelectorHealth(pathname)
  if (results.some((result) => !result.ok)) {
    logger.warn('BossHelper DOM 健康检查失败', {
      pathname,
      stage,
      summary: formatSelectorHealth(results),
    })
  }
}

async function main(router: { path: string }, appRootComponent: Component) {
  const adapter = setActiveSiteAdapter(getSiteAdapterByUrl(location.href))
  const selectors = getActiveSelectorRegistry()
  reportSelectorHealth('route-enter', router.path)
  const module = adapter.matches(new URL(router.path, location.origin).toString())
    ? await adapter.loadPageModule()
    : {
        run() {
          logger.info('BossHelper加载成功')
          logger.warn('当前页面无对应hook脚本', router.path)
        },
      }
  await Promise.resolve(module.run()).catch((error) => {
    logger.error('页面模块运行失败', { error, path: router.path })
  })
  const helper = document.querySelector(selectors.extension.appRoot)
  if (!helper) {
    const app = createApp(appRootComponent)
    app.use(createPinia())
    const appEl = document.createElement('div')
    appEl.id = selectors.extension.appRootId
    document.body.append(appEl)
    app.mount(appEl)
  }
}

async function start() {
  //   document.documentElement.classList.toggle(
  //     "dark",
  //     GM_getValue("theme-dark", false)
  //   );

  initializeBossHelperWindowBridgeTargetFromRuntime()
  const [{ default: App }, { default: axios }] = await Promise.all([
    import('@/App.vue'),
    import('axios'),
  ])
  setActiveSiteAdapter(getSiteAdapterByUrl(location.href))
  await waitForDocumentReady(DOM_READY_TIMEOUT_MS)
  reportSelectorHealth('main-world-start')

  const v = await getRootVue()
  const route = v.$route
  const afterHooks = v.$router?.afterHooks
  if (!route?.path || !Array.isArray(afterHooks)) {
    throw new Error('未找到页面路由上下文')
  }
  afterHooks.push((nextRoute) => void main(nextRoute, App))
  void main(route, App)
  installAxiosLoaderInterceptors(axios as unknown as AxiosLoaderClient)
}

export default defineUnlistedScript(() => {
  start().catch((e) => {
    logger.error('main-world 启动失败', {
      error: e,
      pathname: location.pathname,
      summary: formatSelectorHealth(collectSelectorHealth(location.pathname)),
    })
  })
})
