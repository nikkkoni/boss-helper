import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { getActiveSiteAdapter } from '@/site-adapters'
import { elmGetter } from '@/utils/elmGetter'
import { logger } from '@/utils/logger'
import { SELECTOR_TIMEOUT_MS, getMountContainerSelectors, joinSelectors } from '@/utils/selectors'

import Ui from './components/Ui.vue'

import './index.scss'

const JOB_PANEL_CLASS = 'boss-helper-job-panel'
const JOB_PANEL_SHELL_CLASS = 'boss-helper-job-shell'

async function mountVue() {
  const selectors = getActiveSiteAdapter(location.href).getSelectors()
  const jobSearchWrapper = await elmGetter.get(
    joinSelectors(getMountContainerSelectors(location.pathname, selectors)),
    { timeoutMs: SELECTOR_TIMEOUT_MS },
  )
  if (document.querySelector(selectors.extension.jobPanel)) {
    return
  }
  const app = createApp(Ui)
  app.use(createPinia())

  const routeKind = selectors.getRouteKind(location.pathname)

  const jobEl = document.createElement('div')
  jobEl.id = selectors.extension.jobPanelId
  jobEl.classList.add(JOB_PANEL_CLASS)

  jobSearchWrapper.setAttribute('help', '出界了哇!')

  if (routeKind === 'job-recommend' || routeKind === 'jobs') {
    const jobWarpEl = document.createElement('div')
    jobWarpEl.id = selectors.extension.jobPanelWrapId
    jobWarpEl.classList.add(JOB_PANEL_SHELL_CLASS)
    jobSearchWrapper.insertBefore(jobWarpEl, jobSearchWrapper.firstElementChild)
    jobWarpEl.appendChild(jobEl)
  } else {
    jobSearchWrapper.insertBefore(jobEl, jobSearchWrapper.firstElementChild)
  }
  app.mount(jobEl)
}

function removeAd() {
  const selectors = getActiveSiteAdapter(location.href).getSelectors()
  for (const selector of selectors.cleanup) {
    void elmGetter.rm(selector, { timeoutMs: SELECTOR_TIMEOUT_MS })
  }
}

export async function run() {
  logger.info('加载/web/geek/job页面Hook')
  removeAd()
  return mountVue()
}
