import axios from 'axios'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { defineUnlistedScript } from '#imports'
import App from '@/App.vue'
import { getRootVue } from '@/composables/useVue'
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

async function main(router: any) {
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
    const app = createApp(App)
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

  setActiveSiteAdapter(getSiteAdapterByUrl(location.href))
  await waitForDocumentReady(DOM_READY_TIMEOUT_MS)
  reportSelectorHealth('main-world-start')

  const v = await getRootVue()
  v.$router.afterHooks.push(main)
  void main(v.$route)
  let axiosLoad: () => void
  axios.interceptors.request.use(
    (config) => {
      if (config.timeout != null) {
        axiosLoad = loader({ ms: config.timeout, color: '#F79E63' })
      }
      return config
    },
    async (error) => {
      axiosLoad()
      return Promise.reject(error)
    },
  )
  axios.interceptors.response.use(
    (response) => {
      axiosLoad()
      return response
    },
    async (error) => {
      axiosLoad()
      return Promise.reject(error)
    },
  )
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
