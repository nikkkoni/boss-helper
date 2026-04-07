import { defineContentScript, injectScript } from '#imports'
import {
  ProvideContentAdapter,
  provideContentCounter,
  registerAgentMessageBridge,
} from '@/message/contentScript'

import '@/main.scss'
import 'element-plus/theme-chalk/src/message-box.scss'
import 'element-plus/theme-chalk/src/message.scss'

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  async main(_ctx) {
    provideContentCounter(new ProvideContentAdapter())
    registerAgentMessageBridge()

    await injectScript('/main-world.js', {
      keepInDom: true,
    })
  },
})
