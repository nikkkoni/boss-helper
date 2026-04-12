import type {
  BossHelperAgentReadinessAction,
  BossHelperAgentReadinessBlocker,
  BossHelperAgentReadinessData,
  BossHelperAgentReadinessSignal,
} from '@/message/agent'
import { getActiveSiteAdapter } from '@/site-adapters'
import {
  collectSelectorHealth,
  formatSelectorHealth,
} from '@/utils/selectors'

const dialogSelectors = [
  '[role="dialog"]',
  '.dialog-wrap',
  '.boss-dialog',
  '.ui-dialog',
  '.zp-dialog',
  '.modal',
  '.modal-container',
  '.boss-popup',
  '.boss-popup-wrapper',
] as const

const loginSelectors = ['.go-login-btn'] as const

const loginPatterns = [
  /请先登录/i,
  /登录后继续/i,
  /扫码登录/i,
  /立即登录/i,
  /去登录/i,
] as const

const captchaPatterns = [
  /验证码/i,
  /安全验证/i,
  /滑块验证/i,
  /请完成验证/i,
  /验证后继续/i,
] as const

const riskPatterns = [
  /账号异常/i,
  /异常提醒/i,
  /操作过于频繁/i,
  /风险提示/i,
  /风控/i,
  /系统检测/i,
  /稍后再试/i,
] as const

type ElementMatch = {
  selector?: string
  text?: string
}

function toPathname(url: string) {
  try {
    return new URL(url).pathname
  } catch {
    return ''
  }
}

function normalizeText(value: string | null | undefined, maxLength = 160) {
  const compact = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (!compact) {
    return ''
  }

  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact
}

function isVisibleElement(element: Element) {
  const htmlElement = element as HTMLElement
  if (htmlElement.hidden) {
    return false
  }

  const style = window.getComputedStyle(htmlElement)
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
}

function findVisibleElement(selectors: readonly string[]): ElementMatch | null {
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      if (!isVisibleElement(element)) {
        continue
      }

      return {
        selector,
        text: normalizeText(element.textContent),
      }
    }
  }

  return null
}

function collectVisibleDialogTexts(extensionSelectors: {
  appRoot: string
  jobPanel: string
  jobPanelWrap: string
}) {
  const texts: string[] = []
  const matchedSelectors = new Set<string>()

  for (const selector of dialogSelectors) {
    for (const element of document.querySelectorAll(selector)) {
      if (
        element.closest(extensionSelectors.appRoot)
        || element.closest(extensionSelectors.jobPanel)
        || element.closest(extensionSelectors.jobPanelWrap)
      ) {
        continue
      }

      if (!isVisibleElement(element)) {
        continue
      }

      const text = normalizeText(element.textContent, 220)
      if (!text) {
        continue
      }

      texts.push(text)
      matchedSelectors.add(selector)
    }
  }

  return {
    selectors: [...matchedSelectors],
    texts,
  }
}

function findPatternMatch(texts: readonly string[], patterns: readonly RegExp[]): string | null {
  for (const text of texts) {
    if (patterns.some((pattern) => pattern.test(text))) {
      return text
    }
  }

  return null
}

function createSignal(
  code: string,
  message: string,
  severity: 'warn' | 'error',
  match?: ElementMatch | null,
): BossHelperAgentReadinessSignal | null {
  if (!match?.selector && !match?.text) {
    return null
  }

  return {
    code,
    detected: true,
    message,
    severity,
    ...(match.selector ? { selector: match.selector } : {}),
    ...(match.text ? { text: match.text } : {}),
  }
}

function pickSuggestedAction(options: {
  hasBlockingModal: boolean
  hasCaptcha: boolean
  hasRiskWarning: boolean
  initialized: boolean
  loginRequired: boolean
  selectorHealthOk: boolean
  supported: boolean
}): BossHelperAgentReadinessAction {
  if (!options.supported) {
    return 'navigate'
  }

  if (options.loginRequired) {
    return 'wait-login'
  }

  if (options.hasCaptcha || options.hasRiskWarning) {
    return 'stop'
  }

  if (!options.initialized || !options.selectorHealthOk || options.hasBlockingModal) {
    return 'refresh-page'
  }

  return 'continue'
}

function buildBlockers(options: {
  hasBlockingModal: boolean
  hasCaptcha: boolean
  hasRiskWarning: boolean
  initialized: boolean
  loginRequired: boolean
  selectorHealthOk: boolean
  supported: boolean
}): BossHelperAgentReadinessBlocker[] {
  const blockers: BossHelperAgentReadinessBlocker[] = []

  if (!options.supported) {
    blockers.push({
      code: 'unsupported-page',
      message: '当前页面不是受支持的 Boss 职位搜索页',
      severity: 'warn',
    })
  }

  if (!options.initialized) {
    blockers.push({
      code: 'page-not-initialized',
      message: 'Boss Helper 页面控制器尚未完成初始化',
      severity: 'warn',
    })
  }

  if (!options.selectorHealthOk) {
    blockers.push({
      code: 'selector-health-failed',
      message: '页面关键选择器未就绪，当前页面状态可能异常',
      severity: 'warn',
    })
  }

  if (options.loginRequired) {
    blockers.push({
      code: 'login-required',
      message: '当前页面显示未登录或需要重新登录',
      severity: 'warn',
    })
  }

  if (options.hasCaptcha) {
    blockers.push({
      code: 'captcha-required',
      message: '检测到验证码或安全验证阻塞',
      severity: 'error',
    })
  }

  if (options.hasRiskWarning) {
    blockers.push({
      code: 'risk-warning',
      message: '检测到异常提醒或风控阻塞',
      severity: 'error',
    })
  }

  if (options.hasBlockingModal) {
    blockers.push({
      code: 'blocking-modal',
      message: '页面存在可见模态框，可能阻断后续操作',
      severity: 'warn',
    })
  }

  return blockers
}

export function collectAgentPageReadiness(): BossHelperAgentReadinessData {
  const selectors = getActiveSiteAdapter(location.href).getSelectors()
  const routeKind = selectors.getRouteKind(location.pathname)
  const supported = routeKind !== 'unknown'
  const selectorHealthChecks = collectSelectorHealth(location.pathname, document, selectors).map((item) => ({
    label: item.label,
    mode: item.mode,
    selectors: [...item.selectors],
    matchedSelectors: [...item.matchedSelectors],
    missingSelectors: [...item.missingSelectors],
    ok: item.ok,
  }))
  const selectorHealthOk = selectorHealthChecks.length > 0 && selectorHealthChecks.every((item) => item.ok)
  const panelMounted = Boolean(document.querySelector(selectors.extension.jobPanel))
  const panelWrapMounted = Boolean(document.querySelector(selectors.extension.jobPanelWrap))
  const rootMounted = Boolean(document.querySelector(selectors.extension.appRoot))
  const initialized = rootMounted && panelMounted
  const dialogInfo = collectVisibleDialogTexts(selectors.extension)
  const bodyText = normalizeText(document.body?.innerText ?? document.body?.textContent ?? '', 800)
  const loginElement = findVisibleElement(loginSelectors)
  const loginText = findPatternMatch([...dialogInfo.texts, bodyText].filter(Boolean), loginPatterns)
  const captchaText = findPatternMatch([...dialogInfo.texts, bodyText].filter(Boolean), captchaPatterns)
  const riskText = findPatternMatch([...dialogInfo.texts, bodyText].filter(Boolean), riskPatterns)
  const loginRequired = Boolean(loginElement || loginText)
  const hasCaptcha = Boolean(captchaText)
  const hasRiskWarning = Boolean(riskText)
  const hasBlockingModal = dialogInfo.texts.length > 0
  const suggestedAction = pickSuggestedAction({
    hasBlockingModal,
    hasCaptcha,
    hasRiskWarning,
    initialized,
    loginRequired,
    selectorHealthOk,
    supported,
  })
  const blockers = buildBlockers({
    hasBlockingModal,
    hasCaptcha,
    hasRiskWarning,
    initialized,
    loginRequired,
    selectorHealthOk,
    supported,
  })
  const signals = [
    createSignal(
      'login-required',
      '检测到登录入口或登录提示',
      'warn',
      loginElement ?? (loginText ? { text: loginText } : null),
    ),
    createSignal(
      'captcha-required',
      '检测到验证码或安全验证提示',
      'error',
      captchaText ? { selector: dialogInfo.selectors[0], text: captchaText } : null,
    ),
    createSignal(
      'risk-warning',
      '检测到异常提醒或风控提示',
      'error',
      riskText ? { selector: dialogInfo.selectors[0], text: riskText } : null,
    ),
    createSignal(
      'blocking-modal',
      '检测到可见模态框',
      'warn',
      hasBlockingModal
        ? { selector: dialogInfo.selectors[0], text: dialogInfo.texts[0] }
        : null,
    ),
  ].filter(Boolean) as BossHelperAgentReadinessSignal[]
  const controllable = supported && initialized && selectorHealthOk && !loginRequired && !hasCaptcha && !hasRiskWarning && !hasBlockingModal

  return {
    snapshotAt: new Date().toISOString(),
    ready: controllable,
    suggestedAction,
    blockers,
    page: {
      active: true,
      controllable,
      exists: true,
      pathname: toPathname(location.href),
      routeKind,
      supported,
      title: document.title,
      url: location.href,
      visible: document.visibilityState !== 'hidden',
    },
    extension: {
      initialized,
      panelMounted,
      panelWrapMounted,
      rootMounted,
      selectorHealth: {
        ok: selectorHealthOk,
        summary: formatSelectorHealth(selectorHealthChecks),
        checks: selectorHealthChecks,
      },
    },
    account: {
      loggedIn: loginRequired ? false : null,
      loginRequired,
    },
    risk: {
      hasBlockingModal,
      hasCaptcha,
      hasRiskWarning,
      signals,
    },
  }
}