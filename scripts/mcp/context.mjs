// @ts-check

import {
  AGENT_CONTEXT_SECTIONS,
  AGENT_PROTOCOL_VERSION,
  DEFAULT_AGENT_CONTEXT_SECTIONS,
} from '../shared/protocol.mjs'

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => String(item).trim()).filter(Boolean)
}

function normalizeAgentContextSections(value) {
  const sections = normalizeStringArray(value).filter((item) => AGENT_CONTEXT_SECTIONS.includes(item))
  return sections.length > 0 ? sections : [...DEFAULT_AGENT_CONTEXT_SECTIONS]
}

function normalizePositiveNumber(value) {
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : 'unknown error'
}

function formatSectionResult(result, options = {}) {
  const envelope = result?.data
  const unwrapCommandData = options.unwrapCommandData === true
  const payload =
    unwrapCommandData && envelope && typeof envelope === 'object' && 'data' in envelope
      ? envelope.data
      : envelope ?? null

  return {
    ok: result?.ok !== false,
    status: typeof result?.status === 'number' ? result.status : undefined,
    code: typeof envelope?.code === 'string' ? envelope.code : undefined,
    message: typeof envelope?.message === 'string' ? envelope.message : undefined,
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
        data: null,
      }
    }
  }

  function buildBridgeRecommendations(healthSection, statusSection) {
    if (healthSection.ok === false) {
      return ['bridge 当前不可用，先确认本地 companion 服务已经启动，再重试 MCP tools。']
    }

    if (statusSection.data?.relayConnected !== true) {
      return [`relay 尚未连接，先在 ${bridgeRuntime.httpsBaseUrl}/ 打开 relay 页面并连接扩展。`]
    }

    return [
      'bridge 与 relay 已就绪，可以先调用 boss_helper_agent_context 聚合页面上下文，再决定是否 navigate / jobs.list / start。',
    ]
  }

  function buildAgentContextRecommendations(sectionResults, readiness, summary) {
    if (!readiness.bridgeOnline) {
      return ['bridge 当前不可用，先恢复 companion 服务，再继续任何页面级操作。']
    }

    if (!readiness.relayConnected) {
      return [`relay 未连接，先在 ${bridgeRuntime.httpsBaseUrl}/ 打开 relay 页面并连接扩展。`]
    }

    const recommendations = []

    if (sectionResults.jobs?.ok === false) {
      recommendations.push('职位列表暂不可读，优先调用 boss_helper_navigate 切到目标搜索页后再重试。')
    }

    if (sectionResults.resume?.ok === false) {
      recommendations.push('简历快照暂不可读，必要时重新打开 Boss 页面后再调用 boss_helper_resume_get。')
    }

    if (summary.pendingReviewCount > 0) {
      recommendations.push(`检测到 ${summary.pendingReviewCount} 个待审核事件，优先处理 job-pending-review -> boss_helper_jobs_review 闭环。`)
    }

    if (summary.jobsVisibleCount > 0) {
      recommendations.push(`当前页面可见 ${summary.jobsVisibleCount} 个候选职位，先筛选再调用 boss_helper_jobs_detail，避免盲目 start。`)
    }

    if (recommendations.length === 0) {
      recommendations.push('运行上下文已准备好，可以继续做定向分析、启动投递或订阅事件。')
    }

    return recommendations
  }

  async function buildBridgeContextResource() {
    const health = await safeBridgeSection('/health')
    const status = await safeBridgeSection('/status')

    return {
      agentProtocolVersion: AGENT_PROTOCOL_VERSION,
      bridge: {
        host: bridgeRuntime.host,
        httpBaseUrl: baseUrl,
        httpsRelayUrl: `${bridgeRuntime.httpsBaseUrl}/`,
        port: bridgeRuntime.port,
        httpsPort: bridgeRuntime.httpsPort,
      },
      readiness: {
        bridgeOnline: health.ok,
        relayConnected: status.data?.relayConnected === true,
        relayCount: Array.isArray(status.data?.relays) ? status.data.relays.length : 0,
        recentEventCount: Number.isFinite(status.data?.recentEventCount) ? status.data.recentEventCount : 0,
      },
      recommendedTools: [
        'boss_helper_agent_context',
        'boss_helper_navigate',
        'boss_helper_jobs_list',
        'boss_helper_jobs_detail',
        'boss_helper_start',
        'boss_helper_wait_for_event',
        'boss_helper_jobs_review',
      ],
      nextSteps: buildBridgeRecommendations(health, status),
    }
  }

  async function readAgentContext(args = {}) {
    const sections = normalizeAgentContextSections(args.include)
    const timeoutMs = normalizePositiveNumber(args.timeoutMs)
    const waitForRelay = typeof args.waitForRelay === 'boolean' ? args.waitForRelay : undefined

    const health = await safeBridgeSection('/health')
    const status = await safeBridgeSection('/status')

    const sectionResults = {
      health,
      status,
    }

    for (const section of sections) {
      switch (section) {
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
    const todayDelivered = Number.isFinite(statsData?.today?.delivered)
      ? statsData.today.delivered
      : Number.isFinite(statsData?.today?.success)
        ? statsData.today.success
        : null

    const readiness = {
      bridgeOnline: health.ok,
      relayConnected: status.data?.relayConnected === true,
      pageControllable: health.ok && status.data?.relayConnected === true,
      relayCount,
    }

    const summary = {
      hasResume: sectionResults.resume?.ok === true,
      hasStats: sectionResults.stats?.ok === true,
      jobsVisibleCount,
      pendingReviewCount,
      recentEventCount: recentEvents.length,
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
    readAgentContext,
  }
}