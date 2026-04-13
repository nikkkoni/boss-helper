import type {
  BossHelperAgentProgress,
  BossHelperAgentRiskLevel,
  BossHelperAgentRiskSummary,
  BossHelperAgentRiskWarning,
} from '@/message/agent'
import type { FormData, Statistics } from '@/types/formData'

type RuntimeFormData = Partial<FormData> | null | undefined
type RuntimeProgress = Partial<BossHelperAgentProgress> | null | undefined
type RuntimeRunSummary = {
  current?: {
    lastError?: {
      code?: string
      message?: string
    } | null
  } | null
  recent?: {
    lastError?: {
      code?: string
      message?: string
    } | null
  } | null
} | null | undefined
type RuntimeStatistics = Partial<Statistics> | null | undefined
type RuntimeFailureGuardrail = {
  consecutiveFailures: number
  limit: number
  triggered: {
    code: string
    message: string
  } | null
} | null | undefined

function toBoolean(value: unknown) {
  return value === true
}

function toNonNegativeInteger(value: unknown) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.trunc(Number(value)))
}

function createWarning(
  code: string,
  message: string,
  severity: BossHelperAgentRiskWarning['severity'],
): BossHelperAgentRiskWarning {
  return {
    code,
    message,
    severity,
  }
}

function resolveRiskLevel(warnings: BossHelperAgentRiskWarning[]): BossHelperAgentRiskLevel {
  if (warnings.some((item) => item.severity === 'warn')) {
    return 'high'
  }

  if (warnings.length > 0) {
    return 'medium'
  }

  return 'low'
}

function resolveTriggeredFailureGuardrail(run: RuntimeRunSummary, failureGuardrail: RuntimeFailureGuardrail) {
  if (failureGuardrail?.triggered) {
    return failureGuardrail.triggered
  }

  const candidates = run?.current ? [run.current] : [run?.recent]
  for (const candidate of candidates) {
    if (candidate?.lastError?.code !== 'consecutive-failure-auto-stop') {
      continue
    }
    if (typeof candidate.lastError.message !== 'string' || !candidate.lastError.message) {
      continue
    }
    return {
      code: candidate.lastError.code,
      message: candidate.lastError.message,
    }
  }

  return null
}

export function buildAgentRiskSummary(options: {
  config: RuntimeFormData
  failureGuardrail?: RuntimeFailureGuardrail
  progress: RuntimeProgress
  run?: RuntimeRunSummary
  todayData: RuntimeStatistics
}): BossHelperAgentRiskSummary {
  const { config, failureGuardrail, progress, run, todayData } = options

  const deliveryLimit = toNonNegativeInteger(config?.deliveryLimit?.value)
  const usedToday = toNonNegativeInteger(todayData?.success)
  const remainingToday = Math.max(deliveryLimit - usedToday, 0)
  const reached = deliveryLimit > 0 && usedToday >= deliveryLimit

  const sameCompanyFilter = toBoolean(config?.sameCompanyFilter?.value)
  const sameHrFilter = toBoolean(config?.sameHrFilter?.value)
  const friendStatus = toBoolean(config?.friendStatus?.value)
  const notification = toBoolean(config?.notification?.value)
  const useCache = toBoolean(config?.useCache?.value)

  const aiFilteringEnabled = toBoolean(config?.aiFiltering?.enable)
  const aiFilteringExternal = aiFilteringEnabled && toBoolean(config?.aiFiltering?.externalMode)
  const aiGreetingEnabled = toBoolean(config?.aiGreeting?.enable)
  const aiReplyEnabled = toBoolean(config?.aiReply?.enable)
  const customGreetingEnabled = toBoolean(config?.customGreeting?.enable)

  const warnings: BossHelperAgentRiskWarning[] = []

  if (deliveryLimit > 100) {
    warnings.push(
      createWarning(
        'high-delivery-limit',
        `当前 deliveryLimit=${deliveryLimit}，已高于推荐的保守默认值 100。`,
        'warn',
      ),
    )
  }

  if (!sameCompanyFilter && !sameHrFilter) {
    warnings.push(
      createWarning(
        'duplicate-guardrails-weakened',
        '相同公司过滤与相同 Hr 过滤同时关闭，重复触达风险会明显升高。',
        'warn',
      ),
    )
  } else {
    if (!sameCompanyFilter) {
      warnings.push(
        createWarning(
          'same-company-filter-disabled',
          '相同公司过滤已关闭，跨岗位重复投递同公司时需要额外谨慎。',
          'info',
        ),
      )
    }
    if (!sameHrFilter) {
      warnings.push(
        createWarning(
          'same-hr-filter-disabled',
          '相同 Hr 过滤已关闭，可能向同一招聘方重复触达。',
          'info',
        ),
      )
    }
  }

  if (!friendStatus) {
    warnings.push(
      createWarning(
        'friend-status-filter-disabled',
        '好友过滤已关闭，已聊过的招聘方不会被自动跳过。',
        'info',
      ),
    )
  }

  if (!notification) {
    warnings.push(
      createWarning(
        'notification-disabled',
        '通知提醒已关闭，批次暂停、限额或错误时更容易错过人工介入时机。',
        'info',
      ),
    )
  }

  if (!useCache) {
    warnings.push(
      createWarning(
        'cache-disabled',
        '本地缓存已关闭，页面刷新或重载后去重与恢复信息会更依赖实时页面状态。',
        'info',
      ),
    )
  }

  if (aiReplyEnabled) {
    warnings.push(
      createWarning(
        'ai-reply-enabled',
        'AI 自动回复已开启，聊天自动化风险高于只读分析或单次投递。',
        'warn',
      ),
    )
  }

  if (!reached && remainingToday > 0 && remainingToday <= 5) {
    warnings.push(
      createWarning(
        'delivery-limit-nearby',
        `今日剩余投递额度仅 ${remainingToday} 次，建议先确认是否还要继续自动执行。`,
        'info',
      ),
    )
  }

  const triggeredFailureGuardrail = resolveTriggeredFailureGuardrail(run, failureGuardrail)
  if (triggeredFailureGuardrail) {
    warnings.push(
      createWarning(
        triggeredFailureGuardrail.code,
        triggeredFailureGuardrail.message,
        'warn',
      ),
    )
  } else if ((failureGuardrail?.consecutiveFailures ?? 0) > 0) {
    warnings.push(
      createWarning(
        'consecutive-failure-streak',
        `当前已连续失败 ${failureGuardrail?.consecutiveFailures} 次；达到 ${failureGuardrail?.limit} 次后会自动暂停投递。`,
        'info',
      ),
    )
  }

  return {
    automation: {
      aiFilteringEnabled,
      aiFilteringExternal,
      aiGreetingEnabled,
      aiReplyEnabled,
      customGreetingEnabled,
    },
    delivery: {
      limit: deliveryLimit,
      reached,
      remainingToday,
      usedToday,
    },
    guardrails: {
      friendStatus,
      notification,
      sameCompanyFilter,
      sameHrFilter,
      useCache,
    },
    level: resolveRiskLevel(warnings),
    observed: {
      deliveredToday: usedToday,
      processedToday: toNonNegativeInteger(todayData?.total),
      repeatFilteredToday: toNonNegativeInteger(todayData?.repeat),
    },
    runtime: {
      state:
        typeof progress?.state === 'string'
          ? progress.state
          : 'idle',
      stopRequested: toBoolean(progress?.stopRequested),
    },
    warnings,
  }
}
