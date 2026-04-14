import type { Browser } from '#imports'
import { browser, defineBackground } from '#imports'
import {
  AGENT_PROTOCOL_VERSION,
  BOSS_HELPER_AGENT_CHANNEL,
  createBossHelperAgentResponse,
  hasValidBossHelperAgentBridgeToken,
  hasValidBossHelperAgentEventPort,
  isBossHelperAgentEventForwardMessage,
  isBossHelperAgentRequest,
  type BossHelperAgentEvent,
  type BossHelperAgentReadinessAction,
  type BossHelperAgentReadinessBlocker,
  type BossHelperAgentReadinessData,
  type BossHelperAgentRequest,
  type BossHelperAgentResponse,
} from '@/message/agent'
import { ProvideBackgroundAdapter, provideBackgroundCounter } from '@/message/background'
import { getSiteAdapterByUrl, isSupportedSiteUrl } from '@/site-adapters'

const zhipinMatches = ['*://zhipin.com/*', '*://*.zhipin.com/*']
const eventPorts = new Set<Browser.runtime.Port>()
const trustedAgentRelayHosts = new Set(['localhost', '127.0.0.1'])
const AGENT_RELAY_KEEPALIVE_TYPE = '__boss_helper_agent_keepalive__'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

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

function isAgentRelayKeepaliveMessage(
  value: unknown,
): value is {
  sentAt?: string
  type: typeof AGENT_RELAY_KEEPALIVE_TYPE
} {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: string }).type === AGENT_RELAY_KEEPALIVE_TYPE
  )
}

function resolveExternalAgentRequestValidationFailure(message: unknown) {
  if (
    !!message &&
    typeof message === 'object' &&
    (message as { channel?: unknown }).channel === BOSS_HELPER_AGENT_CHANNEL &&
    typeof (message as { command?: unknown }).command === 'string'
  ) {
    return createBossHelperAgentResponse(
      false,
      'invalid-command',
      '扩展当前不支持该 agent 命令，可能仍在运行旧版本，请重新加载扩展后重试',
      undefined,
      { retryable: true, suggestedAction: 'refresh-page' },
    )
  }

  return createBossHelperAgentResponse(false, 'validation-failed', 'relay 请求格式无效')
}

async function findAgentTargetTab() {
  const tabs = await browser.tabs.query({ url: zhipinMatches })
  return (
    tabs.find((tab) => tab.active && isSupportedSiteUrl(tab.url)) ??
    tabs.find((tab) => isSupportedSiteUrl(tab.url))
  )
}

async function findAgentTabContext() {
  const tabs = await browser.tabs.query({ url: zhipinMatches })
  return {
    bossTab: tabs.find((tab) => tab.active) ?? tabs[0],
    supportedTab:
      tabs.find((tab) => tab.active && isSupportedSiteUrl(tab.url))
      ?? tabs.find((tab) => isSupportedSiteUrl(tab.url)),
  }
}

function toPathname(url?: string | null) {
  if (!url) {
    return ''
  }

  try {
    return new URL(url).pathname
  } catch {
    return ''
  }
}

function getRouteKind(url?: string | null) {
  if (!url) {
    return 'unknown'
  }

  const pathname = toPathname(url)
  return getSiteAdapterByUrl(url).getSelectors().getRouteKind(pathname)
}

function buildReadinessData(
  tab: Browser.tabs.Tab | undefined,
  options: {
    blockers: BossHelperAgentReadinessBlocker[]
    ready?: boolean
    suggestedAction: BossHelperAgentReadinessAction
  },
): BossHelperAgentReadinessData {
  const supported = isSupportedSiteUrl(tab?.url)

  return {
    snapshotAt: new Date().toISOString(),
    ready: options.ready === true,
    suggestedAction: options.suggestedAction,
    blockers: options.blockers,
    page: {
      active: tab?.active === true,
      controllable: false,
      exists: Boolean(tab?.url),
      pathname: toPathname(tab?.url),
      routeKind: getRouteKind(tab?.url),
      supported,
      title: tab?.title ?? '',
      url: tab?.url ?? '',
      visible: tab?.active === true,
    },
    extension: {
      initialized: false,
      panelMounted: false,
      panelWrapMounted: false,
      rootMounted: false,
      selectorHealth: {
        checks: [],
        ok: false,
        summary: 'page readiness unavailable',
      },
    },
    account: {
      loggedIn: null,
      loginRequired: false,
    },
    risk: {
      hasBlockingModal: false,
      hasCaptcha: false,
      hasRiskWarning: false,
      signals: [],
    },
  }
}

async function forwardAgentRequestToTab(
  targetTab: Browser.tabs.Tab,
  request: BossHelperAgentRequest,
): Promise<BossHelperAgentResponse> {
  if (!targetTab.id) {
    return createBossHelperAgentResponse(false, 'target-tab-not-found', '未找到可用的 Boss 投递页面')
  }

  try {
    const response = await browser.tabs.sendMessage(targetTab.id, {
      ...request,
      requestId: request.requestId ?? crypto.randomUUID(),
      version: request.version ?? AGENT_PROTOCOL_VERSION,
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

async function forwardAgentRequest(
  request: BossHelperAgentRequest,
): Promise<BossHelperAgentResponse> {
  const targetTab = await findAgentTargetTab()
  if (!targetTab?.id) {
    return createBossHelperAgentResponse(false, 'target-tab-not-found', '未找到可用的 Boss 投递页面')
  }

  return forwardAgentRequestToTab(targetTab, request)
}

function mergeReadinessData(
  data: BossHelperAgentReadinessData,
  tab: Browser.tabs.Tab,
): BossHelperAgentReadinessData {
  return {
    ...data,
    page: {
      ...data.page,
      active: tab.active === true,
      exists: Boolean(tab.url),
      pathname: toPathname(tab.url),
      routeKind: getRouteKind(tab.url),
      supported: isSupportedSiteUrl(tab.url),
      title: tab.title ?? data.page.title,
      url: tab.url ?? data.page.url,
      visible: tab.active === true,
    },
  }
}

async function handleReadinessRequest(
  request: BossHelperAgentRequest<'readiness.get'>,
): Promise<BossHelperAgentResponse<BossHelperAgentReadinessData>> {
  const { bossTab, supportedTab } = await findAgentTabContext()

  if (!bossTab) {
    return createBossHelperAgentResponse(true, 'readiness', '已返回当前页面就绪状态', buildReadinessData(undefined, {
      blockers: [
        {
          code: 'boss-page-not-found',
          message: '未检测到已打开的 Boss 页面',
          severity: 'warn',
        },
      ],
      suggestedAction: 'navigate',
    }))
  }

  if (!supportedTab) {
    return createBossHelperAgentResponse(true, 'readiness', '已返回当前页面就绪状态', buildReadinessData(bossTab, {
      blockers: [
        {
          code: 'unsupported-page',
          message: '当前 Boss 页面不是受支持的职位搜索页',
          severity: 'warn',
        },
      ],
      suggestedAction: 'navigate',
    }))
  }

  const response = await forwardAgentRequestToTab(supportedTab, request)
  const readinessData = response.data as BossHelperAgentReadinessData | undefined
  if (response.ok && readinessData) {
    return createBossHelperAgentResponse(true, 'readiness', '已返回当前页面就绪状态', mergeReadinessData(readinessData, supportedTab))
  }

  return createBossHelperAgentResponse(true, 'readiness', '已返回当前页面就绪状态', buildReadinessData(supportedTab, {
    blockers: [
      {
        code: response.code === 'target-tab-not-found' ? 'boss-page-not-found' : response.code,
        message: response.message,
        severity: 'warn',
      },
    ],
    suggestedAction: 'refresh-page',
  }))
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

async function handleExternalAgentRequest(message: unknown, sender: { url?: string | null }) {
  if (!isTrustedAgentRelaySender(sender.url)) {
    return createBossHelperAgentResponse(false, 'unauthorized-bridge', 'relay 来源不可信')
  }

  if (!hasValidBossHelperAgentBridgeToken(message)) {
    return createBossHelperAgentResponse(false, 'unauthorized-bridge', 'relay 认证失败')
  }

  if (!isBossHelperAgentRequest(message)) {
    return resolveExternalAgentRequestValidationFailure(message)
  }

  const { bridgeToken: _bridgeToken, ...request } = message
  if (request.command === 'readiness.get') {
    return handleReadinessRequest(request as BossHelperAgentRequest<'readiness.get'>)
  }
  return forwardAgentRequest(request)
}

async function resolveExternalAgentRequest(message: unknown, sender: { url?: string | null }) {
  return Promise.resolve(handleExternalAgentRequest(message, sender)).catch((error: unknown) =>
    createBossHelperAgentResponse(
      false,
      'tab-forward-failed',
      error instanceof Error ? error.message : '投递页面未就绪',
    ),
  )
}

export default defineBackground({
  // type: 'module',
  main() {
    const sessionStorage = browser.storage?.session
    if (sessionStorage?.setAccessLevel) {
      void sessionStorage.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {})
    }

    provideBackgroundCounter(new ProvideBackgroundAdapter())

    browser.runtime.onConnectExternal.addListener((port) => {
      if (
        !hasValidBossHelperAgentEventPort(port.name) ||
        !isTrustedAgentRelaySender(port.sender?.url)
      ) {
        return
      }

      eventPorts.add(port)
      port.onMessage.addListener((message) => {
        if (isAgentRelayKeepaliveMessage(message)) {
          return
        }
      })
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

    if (globalThis.chrome?.runtime?.onMessageExternal) {
      globalThis.chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
        void resolveExternalAgentRequest(message, sender).then(sendResponse)
        return true
      })
    } else {
      browser.runtime.onMessageExternal.addListener((message, sender) => {
        return resolveExternalAgentRequest(message, sender)
      })
    }
  },
})
