// @ts-check

import {
  AGENT_CONTEXT_SECTIONS,
  AGENT_PROTOCOL_VERSION,
  DEFAULT_AGENT_CONTEXT_SECTIONS,
  resolveBossHelperAgentErrorMeta,
} from '../shared/protocol.mjs'

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
    const pausedByFailureGuardrail = Array.isArray(riskSummary?.warnings)
      && riskSummary.warnings.some((item) => item?.code === 'consecutive-failure-auto-stop')

    if (currentRun?.state === 'paused' && pausedByFailureGuardrail) {
      recommendations.push(`检测到 run ${currentRun.runId} 因连续失败自动暂停，先检查 boss_helper_stats.risk.warnings 与 run.lastError，再决定是否 resume。`)
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
      recommendations.push(`今日投递已到达 deliveryLimit ${riskSummary.delivery.limit}，当前不应继续 start。`)
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

  return {
    buildBridgeContextResource,
    readBootstrapGuide: buildBootstrapGuide,
    readAgentContext,
  }
}
