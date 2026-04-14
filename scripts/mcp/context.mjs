// @ts-check

import {
  AGENT_CONTEXT_SECTIONS,
  AGENT_PROTOCOL_VERSION,
  DEFAULT_AGENT_CONTEXT_SECTIONS,
  resolveBossHelperAgentErrorMeta,
} from '../shared/protocol.mjs'
import {
  BOSS_HELPER_AGENT_AUDIT_CATEGORIES,
  BOSS_HELPER_AGENT_AUDIT_OUTCOMES,
  normalizeBossHelperAgentAudit,
  resolveBossHelperAgentAuditReasonCode,
  resolveBossHelperAgentLogAudit,
} from '../../shared/agentAudit.js'

function isRecord(value) {
  return !!value && typeof value === 'object'
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => String(item).trim()).filter(Boolean)
}

function normalizeAgentContextSections(value) {
  const sections = normalizeStringArray(value).filter((item) => AGENT_CONTEXT_SECTIONS.includes(item))
  const normalized = sections.length > 0 ? sections : [...DEFAULT_AGENT_CONTEXT_SECTIONS]
  return ['readiness', ...normalized.filter((item) => item !== 'readiness')]
}

function normalizePositiveNumber(value) {
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : 'unknown error'
}

function normalizeRelaySnapshot(statusSection) {
  return Array.isArray(statusSection?.data?.relays) ? statusSection.data.relays : []
}

function getKnownExtensionIds(statusSection) {
  return [...new Set(
    normalizeRelaySnapshot(statusSection)
      .map((relay) => (typeof relay?.extensionId === 'string' ? relay.extensionId.trim() : ''))
      .filter(Boolean),
  )]
}

function buildBootstrapReadiness(healthSection, statusSection, readinessSection) {
  const pageReadiness = readinessSection?.data
  const knownExtensionIds = getKnownExtensionIds(statusSection)

  return {
    bridgeOnline: healthSection.ok === true,
    relayConnected: statusSection?.data?.relayConnected === true,
    relayCount: normalizeRelaySnapshot(statusSection).length,
    extensionIdConfigured: knownExtensionIds.length > 0,
    knownExtensionIds,
    bossPageFound: pageReadiness?.page?.exists === true,
    pageSupported: pageReadiness?.page?.supported === true,
    pageInitialized: pageReadiness?.extension?.initialized === true,
    pageControllable: pageReadiness?.page?.controllable === true,
    pageUrl: typeof pageReadiness?.page?.url === 'string' ? pageReadiness.page.url : '',
    routeKind: typeof pageReadiness?.page?.routeKind === 'string' ? pageReadiness.page.routeKind : 'unknown',
    loginRequired: pageReadiness?.account?.loginRequired === true,
    hasCaptcha: pageReadiness?.risk?.hasCaptcha === true,
    hasRiskWarning: pageReadiness?.risk?.hasRiskWarning === true,
    hasBlockingModal: pageReadiness?.risk?.hasBlockingModal === true,
    blockers: Array.isArray(pageReadiness?.blockers)
      ? pageReadiness.blockers.map((item) => item.code)
      : [],
    suggestedAction:
      typeof pageReadiness?.suggestedAction === 'string'
        ? pageReadiness.suggestedAction
        : healthSection.ok === true && statusSection?.data?.relayConnected === true
          ? 'continue'
          : 'stop',
    ready:
      healthSection.ok === true
      && statusSection?.data?.relayConnected === true
      && knownExtensionIds.length > 0
      && pageReadiness?.ready === true,
  }
}

function createBootstrapStep(id, title, status, actor, action, detail) {
  return {
    id,
    title,
    status,
    actor,
    action,
    detail,
  }
}

function buildBootstrapSummary(readiness) {
  if (!readiness.bridgeOnline) {
    return {
      ready: false,
      stage: 'bridge-offline',
      nextAction: 'start-bridge',
      needsHumanAction: true,
    }
  }

  if (!readiness.relayConnected) {
    return {
      ready: false,
      stage: 'relay-offline',
      nextAction: 'open-relay',
      needsHumanAction: true,
    }
  }

  if (!readiness.extensionIdConfigured) {
    return {
      ready: false,
      stage: 'extension-id-missing',
      nextAction: 'configure-extension-id',
      needsHumanAction: true,
    }
  }

  if (!readiness.bossPageFound) {
    return {
      ready: false,
      stage: 'boss-page-missing',
      nextAction: 'open-boss-page',
      needsHumanAction: true,
    }
  }

  if (!readiness.pageSupported) {
    return {
      ready: false,
      stage: 'unsupported-page',
      nextAction: 'navigate',
      needsHumanAction: false,
    }
  }

  if (readiness.loginRequired) {
    return {
      ready: false,
      stage: 'login-required',
      nextAction: 'wait-login',
      needsHumanAction: true,
    }
  }

  if (readiness.hasCaptcha || readiness.hasRiskWarning) {
    return {
      ready: false,
      stage: 'risk-blocked',
      nextAction: 'stop',
      needsHumanAction: true,
    }
  }

  if (!readiness.pageInitialized || !readiness.pageControllable || readiness.hasBlockingModal) {
    return {
      ready: false,
      stage: 'page-not-ready',
      nextAction: 'refresh-page',
      needsHumanAction: true,
    }
  }

  return {
    ready: true,
    stage: 'ready',
    nextAction: 'continue',
    needsHumanAction: false,
  }
}

function buildBootstrapSteps(readiness, relayUrl) {
  const relayBlocked = !readiness.bridgeOnline
  const extensionBlocked = relayBlocked || !readiness.relayConnected
  const bossPageBlocked = extensionBlocked
  const pageReadyBlocked = bossPageBlocked || !readiness.bossPageFound

  return [
    createBootstrapStep(
      'bridge',
      '本地 bridge 在线',
      readiness.bridgeOnline ? 'ready' : 'missing',
      'user',
      'start-bridge',
      readiness.bridgeOnline
        ? 'bridge 已在线，可继续检查 relay 与页面状态。'
        : '需要先启动本地 companion bridge。推荐运行 pnpm agent:start 或 pnpm agent:bridge。',
    ),
    createBootstrapStep(
      'relay',
      'relay 页面已连接扩展',
      relayBlocked ? 'blocked' : readiness.relayConnected ? 'ready' : 'missing',
      'user',
      'open-relay',
      relayBlocked
        ? 'bridge 未在线前，无法建立 relay 连接。'
        : readiness.relayConnected
          ? 'relay 已连接，可继续检查扩展 ID 与页面状态。'
          : `需要在 ${relayUrl} 打开 relay 页面并保持常驻。`,
    ),
    createBootstrapStep(
      'extension-id',
      'relay 已知扩展 ID',
      extensionBlocked ? 'blocked' : readiness.extensionIdConfigured ? 'ready' : 'missing',
      'user',
      'configure-extension-id',
      extensionBlocked
        ? 'relay 未连接前，无法确认扩展 ID 是否已配置。'
        : readiness.extensionIdConfigured
          ? `当前已知扩展 ID: ${readiness.knownExtensionIds.join(', ')}`
          : 'relay 已连接，但未上报 extensionId；请在 relay 页面填写扩展 ID 后点击“保存并重连”。',
    ),
    createBootstrapStep(
      'boss-page',
      'Boss 职位页已打开且位于可诊断范围',
      bossPageBlocked
        ? 'blocked'
        : readiness.bossPageFound && readiness.pageSupported
          ? 'ready'
          : 'missing',
      readiness.bossPageFound && !readiness.pageSupported ? 'agent' : 'user',
      readiness.bossPageFound && !readiness.pageSupported ? 'navigate' : 'open-boss-page',
      bossPageBlocked
        ? '扩展链路未完成前，无法稳定读取 Boss 页面状态。'
        : readiness.bossPageFound && readiness.pageSupported
          ? '已检测到受支持的 Boss 职位搜索页。'
          : readiness.bossPageFound
            ? '当前 Boss 页面存在，但不在受支持的职位搜索路由；可调用 boss_helper_navigate 切回目标搜索页。'
            : '当前未检测到可供扩展接管的 Boss 职位搜索页，需要人工先打开页面。',
    ),
    createBootstrapStep(
      'page-ready',
      '页面已完成初始化并可继续分析',
      pageReadyBlocked
        ? 'blocked'
        : readiness.ready
          ? 'ready'
          : 'missing',
      readiness.suggestedAction === 'navigate' ? 'agent' : 'user',
      readiness.suggestedAction,
      pageReadyBlocked
        ? '在页面存在且可观测之前，无法判断初始化、登录和风控状态。'
        : readiness.ready
          ? '页面初始化、登录与风控状态正常，可以继续读取上下文或分析岗位。'
          : readiness.loginRequired
            ? '当前页面需要用户完成登录后才能继续。'
            : readiness.hasCaptcha || readiness.hasRiskWarning
              ? '检测到验证码或风控阻塞，应先停止自动执行并等待人工处理。'
              : readiness.hasBlockingModal
                ? '当前页面存在阻断交互的模态框，建议先处理或刷新页面。'
                : '页面控制器尚未完全就绪，建议刷新 Boss 页面后再重试。',
    ),
  ]
}

function buildBootstrapNextSteps(readiness, summary, relayUrl) {
  switch (summary.stage) {
    case 'bridge-offline':
      return ['先启动本地 bridge：pnpm agent:start 或 pnpm agent:bridge。']
    case 'relay-offline':
      return [`在 ${relayUrl} 打开 relay 页面，并保持该页面常驻。`]
    case 'extension-id-missing':
      return ['在 relay 页面填写扩展 ID，然后点击“保存并重连”。']
    case 'boss-page-missing':
      return ['人工打开 Boss 职位搜索页；当前没有可供扩展接管的目标标签页。']
    case 'unsupported-page':
      return ['调用 boss_helper_navigate 切回受支持的 Boss 职位搜索页。']
    case 'login-required':
      return ['等待用户完成登录，再重新读取 bootstrap guide 或 agent_context。']
    case 'risk-blocked':
      return ['先处理验证码、风控提醒或阻断弹窗，再继续任何自动化。']
    case 'page-not-ready':
      return [
        readiness.blockers.length > 0
          ? `优先调用 boss_helper_jobs_refresh 刷新当前职位页，并等待扩展重新初始化。当前阻塞信号: ${readiness.blockers.join(', ')}`
          : '优先调用 boss_helper_jobs_refresh 刷新当前职位页，并等待扩展重新初始化。',
      ]
    default:
      return [
        '自举链路已准备好，可以继续调用 boss_helper_agent_context、boss_helper_jobs_list、boss_helper_plan_preview。',
      ]
  }
}

function buildBootstrapRecommendedTools(readiness, summary) {
  const tools = ['boss_helper_bootstrap_guide', 'boss_helper_health', 'boss_helper_status']

  if (readiness.bridgeOnline && readiness.relayConnected) {
    tools.push('boss_helper_agent_context')
  }

  if (summary.nextAction === 'navigate') {
    tools.push('boss_helper_navigate')
  }

  if (summary.nextAction === 'refresh-page') {
    tools.push('boss_helper_jobs_refresh')
  }

  if (summary.ready) {
    tools.push('boss_helper_jobs_list', 'boss_helper_jobs_detail', 'boss_helper_plan_preview', 'boss_helper_start')
  }

  return tools
}

function formatSectionResult(result, options = {}) {
  const resultRecord = isRecord(result) ? result : null
  const hasTransportEnvelope = Boolean(
    resultRecord
    && 'data' in resultRecord
    && (options.unwrapCommandData === true || 'status' in resultRecord || 'command' in resultRecord),
  )
  const envelope = hasTransportEnvelope && isRecord(resultRecord?.data) ? resultRecord.data : null
  const metaSource = envelope ?? resultRecord
  const unwrapCommandData = options.unwrapCommandData === true
  let payload = null

  if (unwrapCommandData && envelope && 'data' in envelope) {
    payload = envelope.data ?? null
  } else if (hasTransportEnvelope) {
    payload = resultRecord?.data ?? null
  } else if (resultRecord && 'data' in resultRecord) {
    payload = resultRecord.data ?? null
  } else if (result !== undefined) {
    payload = result
  }

  return {
    ok: resultRecord?.ok !== false,
    status: typeof resultRecord?.status === 'number' ? resultRecord.status : undefined,
    code: typeof metaSource?.code === 'string' ? metaSource.code : undefined,
    message: typeof metaSource?.message === 'string' ? metaSource.message : undefined,
    retryable: typeof metaSource?.retryable === 'boolean' ? metaSource.retryable : undefined,
    suggestedAction:
      typeof metaSource?.suggestedAction === 'string' ? metaSource.suggestedAction : undefined,
    data: payload,
  }
}

function createRunReportCounter(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]))
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

function timestampInRange(timestamp, from, to) {
  const current = normalizeTimestamp(timestamp)
  if (!current) {
    return false
  }

  const currentMs = Date.parse(current)
  const fromMs = from ? Date.parse(from) : Number.NEGATIVE_INFINITY
  const toMs = to ? Date.parse(to) : Number.POSITIVE_INFINITY
  return currentMs >= fromMs && currentMs <= toMs
}

function trimReasonCode(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function toRunReportJobSnapshot(job) {
  if (!isRecord(job)) {
    return null
  }

  const encryptJobId = trimReasonCode(job.encryptJobId, '')
  const jobName = trimReasonCode(job.jobName, '')
  const brandName = trimReasonCode(job.brandName, '')
  if (!encryptJobId && !jobName && !brandName) {
    return null
  }

  return {
    encryptJobId,
    jobName,
    brandName,
  }
}

function toRunReportDecisionLogFromLog(entry, runId) {
  const detail = isRecord(entry?.pipelineError) ? { pipelineError: entry.pipelineError } : {}
  if (typeof entry?.error === 'string' && entry.error) {
    detail.error = entry.error
  }
  if (typeof entry?.greeting === 'string' && entry.greeting) {
    detail.greeting = entry.greeting
  }
  if (isRecord(entry?.aiScore)) {
    detail.aiScore = entry.aiScore
  }
  if (isRecord(entry?.review)) {
    detail.review = entry.review
  }

  const pipelineError = isRecord(entry?.pipelineError) ? entry.pipelineError : null
  const step = trimReasonCode(pipelineError?.step, '')
  const status = trimReasonCode(entry?.status, '未知状态')
  const message = trimReasonCode(entry?.message, trimReasonCode(entry?.error, status))
  const audit = normalizeBossHelperAgentAudit(entry?.audit)
    ?? resolveBossHelperAgentLogAudit({
      detail: pipelineError,
      fallback: 'log-entry',
      message,
      status,
      step,
    })

  return {
    source: 'log',
    timestamp: normalizeTimestamp(entry?.timestamp) ?? new Date(0).toISOString(),
    runId: typeof entry?.runId === 'string' && entry.runId ? entry.runId : runId,
    category: audit.category,
    outcome: audit.outcome,
    reasonCode: audit.reasonCode,
    message,
    job: toRunReportJobSnapshot(entry),
    reference: {
      kind: 'log',
      status,
      step: step || null,
    },
    detail: Object.keys(detail).length > 0 ? detail : null,
  }
}

function toRunReportDecisionLogFromEvent(event, runId) {
  const detail = isRecord(event?.detail) ? event.detail : null
  const eventType = trimReasonCode(event?.type, 'unknown-event')
  const status = typeof detail?.errorName === 'string' && detail.errorName ? detail.errorName : eventType
  const message = trimReasonCode(event?.message, eventType)
  const step = trimReasonCode(detail?.step, '')

  let audit
  switch (eventType) {
    case 'batch-started':
    case 'batch-resumed':
    case 'batch-pausing':
    case 'batch-paused':
    case 'batch-stopped':
    case 'batch-completed':
    case 'job-started':
    case 'state-changed':
    case 'chat-sent':
      audit = {
        category: 'execution',
        outcome: 'info',
        reasonCode: eventType,
      }
      break
    case 'job-succeeded':
      audit = {
        category: 'execution',
        outcome: 'delivered',
        reasonCode: eventType,
      }
      break
    case 'job-pending-review':
      audit = {
        category: 'business',
        outcome: 'info',
        reasonCode: 'external-review-required',
      }
      break
    case 'batch-error':
      audit = {
        category: 'system',
        outcome: 'failed',
        reasonCode: 'batch-error',
      }
      break
    case 'limit-reached':
    case 'rate-limited':
      audit = {
        category: 'risk',
        outcome: 'interrupted',
        reasonCode: resolveBossHelperAgentAuditReasonCode({
          detail,
          fallback: eventType,
          message,
          status,
          step,
        }),
      }
      break
    case 'job-filtered':
      audit = resolveBossHelperAgentLogAudit({
        detail,
        fallback: eventType,
        message,
        status,
        step,
      })
      if (audit.outcome === 'failed') {
        audit = { ...audit, outcome: 'skipped' }
      }
      break
    default:
      audit = resolveBossHelperAgentLogAudit({
        detail,
        fallback: eventType,
        message,
        status,
        step,
      })
      break
  }

  return {
    source: 'event',
    timestamp: normalizeTimestamp(event?.createdAt) ?? new Date(0).toISOString(),
    runId,
    category: audit.category,
    outcome: audit.outcome,
    reasonCode: audit.reasonCode,
    message,
    job: toRunReportJobSnapshot(event?.job),
    reference: {
      kind: 'event',
      eventType,
      step: step || null,
    },
    detail,
  }
}

function resolveRunReportSelection(statsData, runId) {
  const currentRun = isRecord(statsData?.run?.current) ? statsData.run.current : null
  const recentRun = isRecord(statsData?.run?.recent) ? statsData.run.recent : null

  if (typeof runId === 'string' && runId.trim()) {
    if (currentRun?.runId === runId) {
      return { currentRun, recentRun, run: currentRun, scope: 'current' }
    }
    if (recentRun?.runId === runId) {
      return { currentRun, recentRun, run: recentRun, scope: 'recent' }
    }
    return { currentRun, recentRun, run: null, scope: 'missing' }
  }

  if (currentRun) {
    return { currentRun, recentRun, run: currentRun, scope: 'current' }
  }

  if (recentRun) {
    return { currentRun, recentRun, run: recentRun, scope: 'recent' }
  }

  return { currentRun, recentRun, run: null, scope: 'none' }
}

function buildRunReportRecommendations(report) {
  const recommendations = []
  const { reviewAudit, sections, summary } = report

  if (sections.logs?.ok === false) {
    recommendations.push('结构化日志当前不可读，建议先恢复 logs.query 链路，再复核 run report。')
  }
  if (sections.events?.ok === false) {
    recommendations.push('最近事件当前不可读，run report 只能基于 stats 与 logs，必要时再重试 events_recent。')
  }
  if (!report.run) {
    recommendations.push('当前没有可用于审计的 current/recent run，可先调用 boss_helper_plan_preview 或重新读取 boss_helper_stats。')
    return recommendations
  }

  if (summary.categoryCounts.config > 0) {
    recommendations.push('报告中存在配置类阻塞，先复核模型、地图或相关运行配置，再决定是否重试。')
  }
  if (summary.categoryCounts.page > 0) {
    recommendations.push('报告中存在页面类失败，优先刷新 Boss 页面并重新读取 readiness。')
  }
  if (summary.categoryCounts.system > 0) {
    recommendations.push('报告中存在系统类失败，建议继续检查最近 decisionLog 里的 pipelineError / detail。')
  }
  if (summary.categoryCounts.risk > 0 || summary.outcomeCounts.interrupted > 0) {
    recommendations.push('报告显示本轮命中过风险护栏或速率限制，继续执行前先复核 risk.warnings 与 run.lastError。')
  }
  if (reviewAudit.pendingReviewCount > 0) {
    recommendations.push(`报告显示仍有 ${reviewAudit.pendingReviewCount} 个待审核事件，优先完成 job-pending-review -> boss_helper_jobs_review 闭环。`)
  }

  if (recommendations.length === 0) {
    recommendations.push('当前 run report 未发现新的高优先级阻塞，可结合 stats / readiness 继续推进下一步。')
  }

  return recommendations
}

function chooseLatestRunReportEntry(left, right) {
  if (!left) {
    return right ?? null
  }
  if (!right) {
    return left
  }
  return Date.parse(right.timestamp) >= Date.parse(left.timestamp) ? right : left
}

function dedupeRunReportEntriesByJob(entries) {
  const keyed = new Map()
  const fallback = []

  for (const entry of entries) {
    const jobId = trimReasonCode(entry?.encryptJobId, '')
    if (!jobId) {
      fallback.push(entry)
      continue
    }
    keyed.set(jobId, chooseLatestRunReportEntry(keyed.get(jobId), entry))
  }

  return [...keyed.values(), ...fallback]
}

/** @param {ReturnType<import('./bridge-client.mjs').createBridgeClient>} bridgeClient */
export function createAgentContextService(bridgeClient) {
  const { baseUrl, bridgeGet, bridgeRuntime, commandCall, readRecentEvents } = bridgeClient

  async function safeBridgeSection(path) {
    try {
      return formatSectionResult(await bridgeGet(path))
    } catch (error) {
      return {
        ok: false,
        code: 'bridge-request-failed',
        message: toErrorMessage(error),
        ...resolveBossHelperAgentErrorMeta('bridge-request-failed'),
        data: null,
      }
    }
  }

  async function safeCommandSection(command, args) {
    try {
      return formatSectionResult(await commandCall(command, args), { unwrapCommandData: true })
    } catch (error) {
      return {
        ok: false,
        code: 'command-request-failed',
        message: toErrorMessage(error),
        ...resolveBossHelperAgentErrorMeta('command-request-failed'),
        data: null,
      }
    }
  }

  async function safeEventSection(args = {}) {
    try {
      return formatSectionResult(await readRecentEvents(args))
    } catch (error) {
      return {
        ok: false,
        code: 'event-request-failed',
        message: toErrorMessage(error),
        ...resolveBossHelperAgentErrorMeta('event-request-failed'),
        data: null,
      }
    }
  }

  async function buildBootstrapGuide() {
    const health = await safeBridgeSection('/health')
    const status = await safeBridgeSection('/status')
    const readinessSection = await safeCommandSection('readiness.get', { waitForRelay: false })
    const readiness = buildBootstrapReadiness(health, status, readinessSection)
    const summary = buildBootstrapSummary(readiness)
    const relayUrl = `${bridgeRuntime.httpsBaseUrl}/`

    return {
      ok: true,
      agentProtocolVersion: AGENT_PROTOCOL_VERSION,
      bridge: {
        host: bridgeRuntime.host,
        httpBaseUrl: baseUrl,
        httpsRelayUrl: relayUrl,
        port: bridgeRuntime.port,
        httpsPort: bridgeRuntime.httpsPort,
      },
      readiness,
      summary,
      steps: buildBootstrapSteps(readiness, relayUrl),
      recommendedTools: buildBootstrapRecommendedTools(readiness, summary),
      nextSteps: buildBootstrapNextSteps(readiness, summary, relayUrl),
      sections: {
        health,
        status,
        readiness: readinessSection,
      },
    }
  }

  function buildAgentContextRecommendations(sectionResults, readiness, summary) {
    if (!readiness.bridgeOnline) {
      return ['bridge 当前不可用，先恢复 companion 服务，再继续任何页面级操作。']
    }

    if (!readiness.relayConnected) {
      return [`relay 未连接，先在 ${bridgeRuntime.httpsBaseUrl}/ 打开 relay 页面并连接扩展。`]
    }

    const pageReadiness = sectionResults.readiness?.data
    if (pageReadiness?.ready === false) {
      const blockerCodes = Array.isArray(pageReadiness.blockers)
        ? pageReadiness.blockers.map((item) => item.code).join(', ')
        : ''

      switch (pageReadiness.suggestedAction) {
        case 'navigate':
          return [
            blockerCodes
              ? `当前页面不可执行，请先 navigate 到受支持的 Boss 职位页。阻塞信号: ${blockerCodes}`
              : '当前页面不可执行，请先 navigate 到受支持的 Boss 职位页。',
          ]
        case 'wait-login':
          return [
            blockerCodes
              ? `当前页面需要登录后才能继续。阻塞信号: ${blockerCodes}`
              : '当前页面需要登录后才能继续。',
          ]
        case 'stop':
          return [
            blockerCodes
              ? `检测到验证码或风控阻塞，当前应停止自动执行。阻塞信号: ${blockerCodes}`
              : '检测到验证码或风控阻塞，当前应停止自动执行。',
          ]
        case 'refresh-page':
          return [
            blockerCodes
              ? `页面控制器尚未就绪，建议调用 boss_helper_jobs_refresh 刷新当前职位页后重试。阻塞信号: ${blockerCodes}`
              : '页面控制器尚未就绪，建议调用 boss_helper_jobs_refresh 刷新当前职位页后重试。',
          ]
        default:
          break
      }
    }

    const recommendations = []
    const currentRun = sectionResults.stats?.data?.run?.current
    const recentRun = sectionResults.stats?.data?.run?.recent
    const riskSummary = sectionResults.stats?.data?.risk
    const pausedByDailyDeliveryLimit = currentRun?.state === 'paused'
      && riskSummary?.delivery?.reached
      && currentRun?.lastError?.code === 'delivery-limit-reached'
    const pausedByRunDeliveryLimit = currentRun?.state === 'paused'
      && currentRun?.lastError?.code === 'run-delivery-limit-reached'
    const pausedByAutoStopGuardrail = Array.isArray(riskSummary?.warnings)
      ? riskSummary.warnings.find((item) => typeof item?.code === 'string' && item.code.endsWith('-auto-stop'))?.code
      : null

    if (pausedByDailyDeliveryLimit) {
      recommendations.push(`检测到 run ${currentRun.runId} 已触发今日 deliveryLimit ${riskSummary?.delivery?.limit ?? 'unknown'}，当前不建议 resume；如需继续请先 stop 当前 run，并等待下一个自然日或显式调整 deliveryLimit 后再重新 start。`)
    } else if (pausedByRunDeliveryLimit) {
      recommendations.push(`检测到 run ${currentRun.runId} 已达到本轮投递上限 ${riskSummary?.delivery?.runLimit ?? 'unknown'}，当前不建议 resume；如需继续请先 stop 当前 run，再重新 start 新的一轮。`)
    } else if (currentRun?.state === 'paused' && pausedByAutoStopGuardrail) {
      recommendations.push(`检测到 run ${currentRun.runId} 因安全护栏 ${pausedByAutoStopGuardrail} 自动暂停，先检查 boss_helper_stats.risk.warnings 与 run.lastError，再决定是否 resume。`)
    } else if (currentRun?.state === 'paused' && currentRun.recovery?.resumable) {
      recommendations.push(`检测到暂停中的 run ${currentRun.runId}，如确认页面仍一致，可先调用 boss_helper_resume。`)
    } else if (currentRun?.state === 'running' || currentRun?.state === 'pausing') {
      recommendations.push(`检测到进行中的 run ${currentRun.runId}，优先观察 stats / events，再决定是否继续控制。`)
    } else if (recentRun?.state === 'error') {
      recommendations.push('最近一次 run 以错误结束，建议先读取 readiness 并刷新页面后再决定是否重试。')
    }

    if (sectionResults.jobs?.ok === false) {
      recommendations.push('职位列表暂不可读，优先调用 boss_helper_navigate 切到目标搜索页后再重试。')
    }

    if (sectionResults.resume?.ok === false) {
      recommendations.push('简历快照暂不可读，必要时重新打开 Boss 页面后再调用 boss_helper_resume_get。')
    }

    if (summary.pendingReviewCount > 0) {
      recommendations.push(`检测到 ${summary.pendingReviewCount} 个待审核事件，优先处理 job-pending-review -> boss_helper_jobs_review 闭环。`)
    }

    if (riskSummary?.delivery?.reached) {
      if (!pausedByDailyDeliveryLimit) {
        recommendations.push(`今日投递已到达 deliveryLimit ${riskSummary.delivery.limit}，当前不应继续 start 或 resume；如存在暂停中的 run，先 stop 再等待下一个自然日。`)
      }
    } else if (riskSummary?.delivery?.runReached) {
      recommendations.push(`当前 run 已达到本轮投递上限 ${riskSummary.delivery.runLimit}，如需继续请先 stop 当前 run，再重新 start 新的一轮。`)
    } else if (riskSummary?.level === 'high') {
      recommendations.push(`当前安全护栏摘要为 high，建议先检查 boss_helper_stats.risk.warnings，再决定是否继续 start。`)
    } else if (Array.isArray(riskSummary?.warnings) && riskSummary.warnings.length > 0) {
      recommendations.push(`当前安全护栏摘要包含 ${riskSummary.warnings.length} 条提醒，可先读取 boss_helper_stats.risk 评估风险面。`)
    }

    if (summary.jobsVisibleCount > 0) {
      recommendations.push(`当前页面可见 ${summary.jobsVisibleCount} 个候选职位，优先调用 boss_helper_plan_preview 或少量 boss_helper_jobs_detail，再决定是否 start。`)
    }

    if (recommendations.length === 0) {
      recommendations.push('运行上下文已准备好，可以继续做定向分析、启动投递或订阅事件。')
    }

    return recommendations
  }

  async function buildBridgeContextResource() {
    return buildBootstrapGuide()
  }

  async function readAgentContext(args = {}) {
    const sections = normalizeAgentContextSections(args.include)
    const timeoutMs = normalizePositiveNumber(args.timeoutMs)
    const waitForRelayArg = typeof args.waitForRelay === 'boolean' ? args.waitForRelay : undefined

    const health = await safeBridgeSection('/health')
    const status = await safeBridgeSection('/status')
    const waitForRelay = waitForRelayArg ?? (status.data?.relayConnected === true)

    const sectionResults = {
      health,
      status,
    }
    for (const section of sections) {
      switch (section) {
        case 'readiness':
          sectionResults.readiness = await safeCommandSection('readiness.get', { timeoutMs, waitForRelay })
          break
        case 'config':
          sectionResults.config = await safeCommandSection('config.get', { timeoutMs, waitForRelay })
          break
        case 'events':
          sectionResults.events = await safeEventSection({
            timeoutMs: timeoutMs ?? 5_000,
            types: args.eventTypes,
          })
          break
        case 'jobs':
          sectionResults.jobs = await safeCommandSection('jobs.list', {
            statusFilter: args.statusFilter,
            timeoutMs,
            waitForRelay,
          })
          if (Array.isArray(sectionResults.jobs.data?.jobs) && Number.isFinite(args.jobsLimit) && args.jobsLimit > 0) {
            sectionResults.jobs.data = {
              ...sectionResults.jobs.data,
              jobs: sectionResults.jobs.data.jobs.slice(0, Math.max(1, Number(args.jobsLimit))),
            }
          }
          break
        case 'logs':
          sectionResults.logs = await safeCommandSection('logs.query', {
            limit: Number.isFinite(args.logsLimit) && args.logsLimit > 0 ? Number(args.logsLimit) : 10,
            timeoutMs,
            waitForRelay,
          })
          break
        case 'resume':
          sectionResults.resume = await safeCommandSection('resume.get', { timeoutMs, waitForRelay })
          break
        case 'stats':
          sectionResults.stats = await safeCommandSection('stats', { timeoutMs, waitForRelay })
          break
        default:
          break
      }
    }

    const jobsVisibleCount = Array.isArray(sectionResults.jobs?.data?.jobs) ? sectionResults.jobs.data.jobs.length : 0
    const recentEvents = Array.isArray(sectionResults.events?.data?.recent) ? sectionResults.events.data.recent : []
    const pendingReviewCount = recentEvents.filter((event) => event?.type === 'job-pending-review').length
    const relayCount = Array.isArray(status.data?.relays) ? status.data.relays.length : 0
    const statsData = sectionResults.stats?.data
    const currentRun = statsData?.run?.current ?? null
    const recentRun = statsData?.run?.recent ?? null
    const riskSummary = statsData?.risk ?? null
    const pageReadiness = sectionResults.readiness?.data
    const todayDelivered = Number.isFinite(statsData?.today?.delivered)
      ? statsData.today.delivered
      : Number.isFinite(statsData?.today?.success)
        ? statsData.today.success
        : Number.isFinite(statsData?.todayData?.delivered)
          ? statsData.todayData.delivered
          : Number.isFinite(statsData?.todayData?.success)
            ? statsData.todayData.success
        : null

    const readiness = {
      bridgeOnline: health.ok,
      relayConnected: status.data?.relayConnected === true,
      relayCount,
      bossPageFound: pageReadiness?.page?.exists === true,
      pageSupported: pageReadiness?.page?.supported === true,
      pageUrl: typeof pageReadiness?.page?.url === 'string' ? pageReadiness.page.url : '',
      routeKind: typeof pageReadiness?.page?.routeKind === 'string' ? pageReadiness.page.routeKind : 'unknown',
      pageInitialized: pageReadiness?.extension?.initialized === true,
      pageControllable:
        health.ok
        && status.data?.relayConnected === true
        && pageReadiness?.page?.controllable === true,
      loggedIn:
        typeof pageReadiness?.account?.loggedIn === 'boolean' ? pageReadiness.account.loggedIn : null,
      loginRequired: pageReadiness?.account?.loginRequired === true,
      hasCaptcha: pageReadiness?.risk?.hasCaptcha === true,
      hasRiskWarning: pageReadiness?.risk?.hasRiskWarning === true,
      hasBlockingModal: pageReadiness?.risk?.hasBlockingModal === true,
      ready: health.ok && status.data?.relayConnected === true && pageReadiness?.ready === true,
      blockers: Array.isArray(pageReadiness?.blockers)
        ? pageReadiness.blockers.map((item) => item.code)
        : [],
      suggestedAction:
        typeof pageReadiness?.suggestedAction === 'string'
          ? pageReadiness.suggestedAction
          : health.ok && status.data?.relayConnected === true
            ? 'continue'
            : 'stop',
    }

    const summary = {
      currentRunId: typeof currentRun?.runId === 'string' ? currentRun.runId : null,
      hasResume: sectionResults.resume?.ok === true,
      hasStats: sectionResults.stats?.ok === true,
      hasActiveRun: currentRun != null,
      jobsVisibleCount,
      pendingReviewCount,
      remainingDeliveryCapacity:
        Number.isFinite(riskSummary?.delivery?.remainingToday) ? riskSummary.delivery.remainingToday : null,
      readinessBlockerCount: Array.isArray(pageReadiness?.blockers) ? pageReadiness.blockers.length : 0,
      recentEventCount: recentEvents.length,
      recentRunState: typeof recentRun?.state === 'string' ? recentRun.state : null,
      riskLevel: typeof riskSummary?.level === 'string' ? riskSummary.level : null,
      riskWarningCount: Array.isArray(riskSummary?.warnings) ? riskSummary.warnings.length : 0,
      resumableRun: recentRun?.recovery?.resumable === true,
      todayDelivered,
    }

    return {
      ok: true,
      agentProtocolVersion: AGENT_PROTOCOL_VERSION,
      bridge: {
        httpBaseUrl: baseUrl,
        httpsRelayUrl: `${bridgeRuntime.httpsBaseUrl}/`,
      },
      requestedSections: sections,
      readiness,
      summary,
      sections: sectionResults,
      recommendations: buildAgentContextRecommendations(sectionResults, readiness, summary),
    }
  }

  async function readRunReport(args = {}) {
    const timeoutMs = normalizePositiveNumber(args.timeoutMs)
    const logLimit = Number.isFinite(args.logLimit) && args.logLimit > 0 ? Number(args.logLimit) : 25
    const eventLimit = Number.isFinite(args.eventLimit) && args.eventLimit > 0 ? Number(args.eventLimit) : 20
    const status = await safeBridgeSection('/status')
    const waitForRelayArg = typeof args.waitForRelay === 'boolean' ? args.waitForRelay : undefined
    const waitForRelay = waitForRelayArg ?? (status.data?.relayConnected === true)
    const stats = await safeCommandSection('stats', { timeoutMs, waitForRelay })

    if (stats.ok === false) {
      return {
        ok: false,
        code: stats.code ?? 'run-report-unavailable',
        message: `无法读取 run report：${stats.message ?? 'stats 不可用'}`,
        retryable: stats.retryable,
        suggestedAction: stats.suggestedAction,
        agentProtocolVersion: AGENT_PROTOCOL_VERSION,
        bridge: {
          httpBaseUrl: baseUrl,
          httpsRelayUrl: `${bridgeRuntime.httpsBaseUrl}/`,
        },
        sections: {
          status,
          stats,
        },
      }
    }

    const selection = resolveRunReportSelection(stats.data, typeof args.runId === 'string' ? args.runId.trim() : '')
    if (selection.scope === 'missing') {
      return {
        ok: false,
        code: 'run-report-not-found',
        message: `未找到 run ${args.runId}，当前只能审计 current/recent run。`,
        ...resolveBossHelperAgentErrorMeta('validation-failed'),
        agentProtocolVersion: AGENT_PROTOCOL_VERSION,
        availableRunIds: [selection.currentRun?.runId, selection.recentRun?.runId].filter(Boolean),
        bridge: {
          httpBaseUrl: baseUrl,
          httpsRelayUrl: `${bridgeRuntime.httpsBaseUrl}/`,
        },
        sections: {
          status,
          stats,
        },
      }
    }

    const from = normalizeTimestamp(selection.run?.startedAt)
    const to = normalizeTimestamp(selection.run?.finishedAt)
    const logs = await safeCommandSection('logs.query', {
      from: from ?? undefined,
      limit: logLimit,
      timeoutMs,
      to: to ?? undefined,
      waitForRelay,
    })
    const events = await safeEventSection({
      timeoutMs: timeoutMs ?? 5_000,
      types: args.eventTypes,
    })

    const decisionLog = []
    const categoryCounts = createRunReportCounter(BOSS_HELPER_AGENT_AUDIT_CATEGORIES)
    const outcomeCounts = createRunReportCounter(BOSS_HELPER_AGENT_AUDIT_OUTCOMES)

    const logItems = Array.isArray(logs.data?.items) ? logs.data.items : []
    for (const item of logItems) {
      const mapped = toRunReportDecisionLogFromLog(item, selection.run?.runId ?? null)
      decisionLog.push(mapped)
      categoryCounts[mapped.category] += 1
      outcomeCounts[mapped.outcome] += 1
    }

    const recentEvents = Array.isArray(events.data?.recent) ? events.data.recent : []
    const filteredEvents = selection.run
      ? recentEvents.filter((event) => timestampInRange(event?.createdAt, from, to))
      : recentEvents
    for (const item of filteredEvents.slice(-eventLimit)) {
      const mapped = toRunReportDecisionLogFromEvent(item, selection.run?.runId ?? null)
      decisionLog.push(mapped)
      categoryCounts[mapped.category] += 1
      outcomeCounts[mapped.outcome] += 1
    }

    decisionLog.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))

    const reviewEntries = dedupeRunReportEntriesByJob(decisionLog
      .filter((entry) => {
        if (entry.detail?.aiScore?.source === 'external') {
          return true
        }
        return entry.detail?.review?.status === 'accepted' || entry.detail?.review?.status === 'rejected'
      })
      .map((entry) => ({
        accepted:
          entry.detail?.aiScore?.source === 'external'
            ? entry.detail.aiScore.accepted === true
            : entry.detail?.review?.status === 'accepted',
        encryptJobId: entry.job?.encryptJobId ?? '',
        finalDecisionAt:
          typeof entry.detail?.review?.finalDecisionAt === 'string'
            ? entry.detail.review.finalDecisionAt
            : entry.timestamp,
        greeting: typeof entry.detail?.greeting === 'string' ? entry.detail.greeting : null,
        handledBy:
          typeof entry.detail?.review?.handledBy === 'string'
            ? entry.detail.review.handledBy
            : entry.detail?.aiScore?.source === 'external'
              ? 'external-agent'
              : null,
        jobName: entry.job?.jobName ?? '',
        queueDepth:
          Number.isFinite(entry.detail?.review?.queueDepth)
            ? entry.detail.review.queueDepth
            : null,
        queueOverflowLimit:
          Number.isFinite(entry.detail?.review?.queueOverflowLimit)
            ? entry.detail.review.queueOverflowLimit
            : null,
        rating:
          Number.isFinite(entry.detail?.aiScore?.rating)
            ? entry.detail.aiScore.rating
            : Number.isFinite(entry.detail?.review?.rating)
              ? entry.detail.review.rating
              : null,
        reason:
          typeof entry.detail?.aiScore?.reason === 'string' && entry.detail.aiScore.reason
            ? entry.detail.aiScore.reason
            : typeof entry.detail?.review?.reason === 'string' && entry.detail.review.reason
              ? entry.detail.review.reason
              : entry.message,
        reasonCode:
          typeof entry.detail?.review?.reasonCode === 'string'
            ? entry.detail.review.reasonCode
            : entry.detail?.aiScore?.source === 'external'
              ? entry.detail.aiScore.accepted === true
                ? 'external-review-accepted'
                : 'external-review-rejected'
              : null,
        replacementCause:
          typeof entry.detail?.review?.replacementCause === 'string'
            ? entry.detail.review.replacementCause
            : null,
        replacementRunId:
          typeof entry.detail?.review?.replacementRunId === 'string' || entry.detail?.review?.replacementRunId === null
            ? entry.detail.review.replacementRunId ?? null
            : null,
        source:
          typeof entry.detail?.review?.source === 'string'
            ? entry.detail.review.source
            : 'external-ai-review',
        timeoutMs:
          Number.isFinite(entry.detail?.review?.timeoutMs)
            ? entry.detail.review.timeoutMs
            : null,
        timeoutSource:
          typeof entry.detail?.review?.timeoutSource === 'string'
            ? entry.detail.review.timeoutSource
            : null,
        timestamp:
          typeof entry.detail?.review?.updatedAt === 'string' && entry.detail.review.updatedAt
            ? entry.detail.review.updatedAt
            : entry.timestamp,
      })))
    const pendingReviewEvents = dedupeRunReportEntriesByJob(decisionLog.filter((entry) => {
      if (entry.reference?.eventType === 'job-pending-review') {
        return true
      }
      return entry.detail?.review?.status === 'pending'
    })
      .map((entry) => ({
        encryptJobId: entry.job?.encryptJobId ?? '',
        jobName: entry.job?.jobName ?? '',
        message: entry.message,
        queueDepth:
          Number.isFinite(entry.detail?.review?.queueDepth)
            ? entry.detail.review.queueDepth
            : null,
        queueOverflowLimit:
          Number.isFinite(entry.detail?.review?.queueOverflowLimit)
            ? entry.detail.review.queueOverflowLimit
            : null,
        reasonCode:
          typeof entry.detail?.review?.reasonCode === 'string'
            ? entry.detail.review.reasonCode
            : entry.reference?.eventType === 'job-pending-review'
              ? 'external-review-pending'
              : null,
        replacementRunId:
          typeof entry.detail?.review?.replacementRunId === 'string' || entry.detail?.review?.replacementRunId === null
            ? entry.detail.review.replacementRunId ?? null
            : null,
        reviewSource:
          typeof entry.detail?.review?.source === 'string'
            ? entry.detail.review.source
            : null,
        source: entry.source,
        timeoutMs:
          Number.isFinite(entry.detail?.review?.timeoutMs)
            ? entry.detail.review.timeoutMs
            : Number.isFinite(entry.detail?.timeoutMs)
              ? entry.detail.timeoutMs
              : null,
        timestamp: entry.timestamp,
      })))

    const summary = {
      scope: selection.scope,
      selectedRunId: selection.run?.runId ?? null,
      selectedRunState: selection.run?.state ?? null,
      decisionLogCount: decisionLog.length,
      logCount: logItems.length,
      eventCount: filteredEvents.length,
      categoryCounts,
      outcomeCounts,
      externalReviewCount: reviewEntries.length,
      pendingReviewCount: pendingReviewEvents.length,
      lastDecisionType: selection.run?.lastDecision?.type ?? null,
      lastErrorCode: selection.run?.lastError?.code ?? null,
      window: {
        from,
        to,
      },
    }

    const report = {
      ok: true,
      code: 'run-report',
      message: '已返回当前 run 审计报告',
      agentProtocolVersion: AGENT_PROTOCOL_VERSION,
      bridge: {
        httpBaseUrl: baseUrl,
        httpsRelayUrl: `${bridgeRuntime.httpsBaseUrl}/`,
      },
      run: selection.run,
      currentRun: selection.currentRun,
      recentRun: selection.recentRun,
      risk: stats.data?.risk ?? null,
      summary,
      reviewAudit: {
        externalReviews: reviewEntries,
        pendingReviewEvents,
        externalReviewCount: reviewEntries.length,
        pendingReviewCount: pendingReviewEvents.length,
      },
      decisionLog,
      sections: {
        status,
        stats,
        logs,
        events,
      },
    }

    return {
      ...report,
      recommendations: buildRunReportRecommendations(report),
    }
  }

  return {
    buildBridgeContextResource,
    readBootstrapGuide: buildBootstrapGuide,
    readAgentContext,
    readRunReport,
  }
}
