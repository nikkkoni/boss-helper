import type { Browser } from '#imports'
import { browser, defineBackground } from '#imports'
import {
  BOSS_HELPER_AGENT_VERSION,
  createBossHelperAgentResponse,
  hasValidBossHelperAgentBridgeToken,
  hasValidBossHelperAgentEventPort,
  isBossHelperAgentEventForwardMessage,
  isBossHelperAgentRequest,
  isBossHelperSupportedJobUrl,
  type BossHelperAgentEvent,
  type BossHelperAgentRequest,
  type BossHelperAgentResponse,
} from '@/message/agent'
import { ProvideBackgroundAdapter, provideBackgroundCounter } from '@/message/background'

const zhipinMatches = ['*://zhipin.com/*', '*://*.zhipin.com/*']
const eventPorts = new Set<Browser.runtime.Port>()
const trustedAgentRelayHosts = new Set(['localhost', '127.0.0.1'])

function isTrustedAgentRelaySender(url?: string | null) {
  if (!url) {
    return false
  }

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && trustedAgentRelayHosts.has(parsed.hostname)
  } catch {
    return false
  }
}

async function findAgentTargetTab() {
  const tabs = await browser.tabs.query({ url: zhipinMatches })
  return (
    tabs.find((tab) => tab.active && isBossHelperSupportedJobUrl(tab.url)) ??
    tabs.find((tab) => isBossHelperSupportedJobUrl(tab.url))
  )
}

async function forwardAgentRequest(
  request: BossHelperAgentRequest,
): Promise<BossHelperAgentResponse> {
  const targetTab = await findAgentTargetTab()
  if (!targetTab?.id) {
    return createBossHelperAgentResponse(false, 'target-tab-not-found', '未找到可用的 Boss 投递页面')
  }

  try {
    const response = await browser.tabs.sendMessage(targetTab.id, {
      ...request,
      requestId: request.requestId ?? crypto.randomUUID(),
      version: request.version ?? BOSS_HELPER_AGENT_VERSION,
    })

    if (response) {
      return response
    }
  } catch (error) {
    return createBossHelperAgentResponse(
      false,
      'tab-forward-failed',
      error instanceof Error ? error.message : '投递页面未就绪',
    )
  }

  return createBossHelperAgentResponse(false, 'empty-response', '投递页面没有返回结果')
}

function broadcastAgentEvent(event: BossHelperAgentEvent) {
  for (const port of eventPorts) {
    try {
      port.postMessage(event)
    } catch {
      eventPorts.delete(port)
    }
  }
}

export default defineBackground({
  // type: 'module',
  main() {
    provideBackgroundCounter(new ProvideBackgroundAdapter())

    browser.runtime.onConnectExternal.addListener((port) => {
      if (
        !hasValidBossHelperAgentEventPort(port.name) ||
        !isTrustedAgentRelaySender(port.sender?.url)
      ) {
        return
      }

      eventPorts.add(port)
      port.onDisconnect.addListener(() => {
        eventPorts.delete(port)
      })
    })

    browser.runtime.onMessage.addListener((message) => {
      if (!isBossHelperAgentEventForwardMessage(message)) {
        return
      }

      broadcastAgentEvent(message.payload)
      return true
    })

    browser.runtime.onMessageExternal.addListener((message, sender) => {
      if (!isTrustedAgentRelaySender(sender.url)) {
        return createBossHelperAgentResponse(false, 'unauthorized-bridge', 'relay 来源不可信')
      }

      if (!hasValidBossHelperAgentBridgeToken(message) || !isBossHelperAgentRequest(message)) {
        return createBossHelperAgentResponse(false, 'unauthorized-bridge', 'relay 认证失败')
      }

      const { bridgeToken: _bridgeToken, ...request } = message
      return forwardAgentRequest(request)
    })
  },
})
