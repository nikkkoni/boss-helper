import { defineContentScript, injectScript } from '#imports'
import {
  ProvideContentAdapter,
  provideContentCounter,
  registerAgentMessageBridge,
} from '@/message/contentScript'
import { isSupportedSiteUrl } from '@/site-adapters'
import {
  DOM_READY_TIMEOUT_MS,
  collectSelectorHealth,
  formatSelectorHealth,
  waitForDocumentReady,
} from '@/utils/selectors'

import '@/main.scss'
import 'element-plus/theme-chalk/src/message-box.scss'
import 'element-plus/theme-chalk/src/message.scss'

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  async main(_ctx) {
    const reportSelectorHealth = () => {
      if (!isSupportedSiteUrl(location.href)) {
        return
      }

      const results = collectSelectorHealth(location.pathname)
      if (results.some((result) => !result.ok)) {
        window.console.warn('[BossHelper] content script selector health check failed', {
          pathname: location.pathname,
          summary: formatSelectorHealth(results),
        })
      }
    }

    provideContentCounter(new ProvideContentAdapter())
    registerAgentMessageBridge()

    void waitForDocumentReady(DOM_READY_TIMEOUT_MS)
      .then(() => {
        reportSelectorHealth()
      })
      .catch(() => {})

    await injectScript('/main-world.js', {
      keepInDom: true,
    })
  },
})
