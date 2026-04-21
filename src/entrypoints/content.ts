import { browser, defineContentScript } from '#imports'
import {
  ProvideContentAdapter,
  provideContentCounter,
  registerAgentMessageBridge,
} from '@/message/contentScript'
import {
  createBossHelperMainWorldScriptUrl,
  createBossHelperPrivateBridgeEventType,
  ensureBossHelperPrivateBridge,
  getBossHelperMainWorldScriptMarker,
  setBossHelperWindowBridgeEventType,
  setBossHelperWindowBridgeTargetForTest,
} from '@/message/window'
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
    const bridgeToken = crypto.randomUUID()
    const bridgeEventType = createBossHelperPrivateBridgeEventType(bridgeToken)
    const { bridge, host } = ensureBossHelperPrivateBridge()
    setBossHelperWindowBridgeTargetForTest(host)
    setBossHelperWindowBridgeEventType(bridgeEventType)

    const loadMainWorldScript = async () => {
      const script = document.createElement('script')
      script.src = createBossHelperMainWorldScriptUrl(
        browser.runtime.getURL('/main-world.js'),
        bridgeEventType,
      )
      script.setAttribute(`data-${getBossHelperMainWorldScriptMarker()}`, 'true')

      const loadedPromise = new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          script.removeEventListener('load', onLoad)
          script.removeEventListener('error', onError)
        }

        const onLoad = () => {
          cleanup()
          resolve()
        }

        const onError = () => {
          cleanup()
          reject(new Error(`Failed to load script: ${script.src}`))
        }

        script.addEventListener('load', onLoad)
        script.addEventListener('error', onError)
      })

      bridge.append(script)
      await loadedPromise
      return script
    }

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
    const stopAgentMessageBridge = registerAgentMessageBridge()

    void waitForDocumentReady(DOM_READY_TIMEOUT_MS)
      .then(() => {
        reportSelectorHealth()
      })
      .catch(() => {})

    const script = await loadMainWorldScript()

    return () => {
      stopAgentMessageBridge?.()
      setBossHelperWindowBridgeEventType(null)
      if (script.isConnected) {
        script.remove()
      }
    }
  },
})
