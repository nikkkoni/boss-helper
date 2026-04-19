import type {
  BossHelperAgentProgress,
  BossHelperAgentRiskLevel,
  BossHelperAgentRiskSummary,
  BossHelperAgentRiskWarning,
} from '@/message/agent'
import type { LogEntry } from '@/stores/log'
import {
  deliveryLimitGuardrailCode,
  getRunDeliveredCount,
  isDeliveryLimitReached,
  runDeliveryGuardrailCode,
  runDeliveryGuardrailLimit,
} from '@/pages/zhipin/shared/guardrails'
import type { FormData, Statistics } from '@/types/formData'

type RuntimeFormData = Partial<FormData> | null | undefined
type RuntimeProgress = Partial<BossHelperAgentProgress> | null | undefined
type RuntimeRunSummary = {
  current?: {
    deliveredJobIds?: string[] | null
    lastError?: {
      code?: string
      message?: string
    } | null
    state?: string
  } | null
  recent?: {
    deliveredJobIds?: string[] | null
    lastError?: {
      code?: string
      message?: string
    } | null
    state?: string
  } | null
} | null | undefined
type RuntimeStatistics = Partial<Statistics> | null | undefined
type RuntimeLogEntry = Pick<LogEntry, 'createdAt' | 'message' | 'state_name'>
type RuntimeFailureGuardrail = {
  consecutiveFailures: number
  limit: number
  totalFailures: number
  totalLimit: number
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

  const candidates = run?.current
    ? [run.current]
    : run?.recent?.state === 'paused'
      ? [run.recent]
      : []
  for (const candidate of candidates) {
    if (typeof candidate?.lastError?.code !== 'string' || !candidate.lastError.code.endsWith('-auto-stop')) {
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

function resolveRunDeliveryGuardrail(run: RuntimeRunSummary) {
  const candidate = run?.current ?? (run?.recent?.state === 'paused' ? run.recent : null)
  if (candidate?.lastError?.code !== runDeliveryGuardrailCode) {
    return null
  }
  if (typeof candidate.lastError.message !== 'string' || !candidate.lastError.message) {
    return null
  }
  return {
    code: candidate.lastError.code,
    message: candidate.lastError.message,
  }
}

function resolveDailyDeliveryGuardrail(run: RuntimeRunSummary) {
  const candidate = run?.current ?? (run?.recent?.state === 'paused' ? run.recent : null)
  if (candidate?.lastError?.code !== deliveryLimitGuardrailCode) {
    return null
  }
  if (typeof candidate.lastError.message !== 'string' || !candidate.lastError.message) {
    return null
  }
  return {
    code: candidate.lastError.code,
    message: candidate.lastError.message,
  }
}

function buildSessionDuplicateSummary(logs: RuntimeLogEntry[] | null | undefined, todayDate: string) {
  const summary = {
    communicated: 0,
    other: 0,
    sameCompany: 0,
    sameHr: 0,
  }

  if (!Array.isArray(logs) || !todayDate) {
    return summary
  }

  for (const entry of logs) {
    if (entry?.state_name !== '重复沟通') {
      continue
    }

    if (typeof entry.createdAt !== 'string' || !entry.createdAt.startsWith(todayDate)) {
      continue
    }

    const message = typeof entry.message === 'string' ? entry.message : ''
    if (message.includes('已经沟通过')) {
      summary.communicated += 1
      continue
    }
    if (message.includes('相同公司已投递')) {
      summary.sameCompany += 1
      continue
    }
    if (/相同\s*hr已投递/i.test(message)) {
      summary.sameHr += 1
      continue
    }

    summary.other += 1
  }

  return summary
}

export function buildAgentRiskSummary(options: {
  config: RuntimeFormData
  failureGuardrail?: RuntimeFailureGuardrail
  logs?: RuntimeLogEntry[]
  progress: RuntimeProgress
  run?: RuntimeRunSummary
  todayData: RuntimeStatistics
}): BossHelperAgentRiskSummary {
  const { config, failureGuardrail, logs, progress, run, todayData } = options

  const deliveryLimit = toNonNegativeInteger(config?.deliveryLimit?.value)
  const usedToday = toNonNegativeInteger(todayData?.success)
  const remainingToday = Math.max(deliveryLimit - usedToday, 0)
  const reached = isDeliveryLimitReached(deliveryLimit, usedToday)
  const currentOrResumableRun = run?.current ?? (run?.recent?.state === 'paused' ? run.recent : null)
  const usedInRun = getRunDeliveredCount(currentOrResumableRun)
  const remainingInRun = Math.max(runDeliveryGuardrailLimit - usedInRun, 0)
  const runReached = runDeliveryGuardrailLimit > 0 && usedInRun >= runDeliveryGuardrailLimit
  const sessionDuplicates = buildSessionDuplicateSummary(logs, typeof todayData?.date === 'string' ? todayData.date : '')

  const sameCompanyFilter = toBoolean(config?.sameCompanyFilter?.value)
  const sameHrFilter = toBoolean(config?.sameHrFilter?.value)
  const friendStatus = toBoolean(config?.friendStatus?.value)
  const notification = toBoolean(config?.notification?.value)
  const useCache = toBoolean(config?.useCache?.value)

  const aiFilteringEnabled = toBoolean(config?.aiFiltering?.enable)
  const aiFilteringExternal = aiFilteringEnabled && toBoolean(config?.aiFiltering?.externalMode)

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

  const triggeredDailyDeliveryGuardrail = reached ? resolveDailyDeliveryGuardrail(run) : null
  if (triggeredDailyDeliveryGuardrail) {
    warnings.push(
      createWarning(
        triggeredDailyDeliveryGuardrail.code,
        triggeredDailyDeliveryGuardrail.message,
        'warn',
      ),
    )
  } else if (reached) {
    warnings.push(
      createWarning(
        deliveryLimitGuardrailCode,
        `今日投递已达到上限 ${deliveryLimit}，当前不应继续 start 或 resume。`,
        'warn',
      ),
    )
  } else if (remainingToday > 0 && remainingToday <= 5) {
    warnings.push(
      createWarning(
        'delivery-limit-nearby',
        `今日剩余投递额度仅 ${remainingToday} 次，建议先确认是否还要继续自动执行。`,
        'info',
      ),
    )
  }

  const triggeredFailureGuardrail = resolveTriggeredFailureGuardrail(run, failureGuardrail)
  const triggeredRunDeliveryGuardrail = resolveRunDeliveryGuardrail(run)
  if (triggeredFailureGuardrail) {
    warnings.push(
      createWarning(
        triggeredFailureGuardrail.code,
        triggeredFailureGuardrail.message,
        'warn',
      ),
    )
  } else {
    if ((failureGuardrail?.totalFailures ?? 0) >= (failureGuardrail?.totalLimit ?? Number.POSITIVE_INFINITY)) {
      warnings.push(
        createWarning(
          'failure-count-limit-reached',
          `当前批次累计失败已达到 ${failureGuardrail?.totalLimit} 次；如继续 resume，下一次非 warning 失败会再次自动暂停投递。`,
          'warn',
        ),
      )
    } else if ((failureGuardrail?.totalFailures ?? 0) > 0) {
      warnings.push(
        createWarning(
          'failure-count-progress',
          `当前批次累计失败 ${failureGuardrail?.totalFailures} 次；达到 ${failureGuardrail?.totalLimit} 次后会自动暂停投递。`,
          'info',
        ),
      )
    }

    if ((failureGuardrail?.consecutiveFailures ?? 0) > 0) {
      warnings.push(
        createWarning(
          'consecutive-failure-streak',
          `当前已连续失败 ${failureGuardrail?.consecutiveFailures} 次；达到 ${failureGuardrail?.limit} 次后会自动暂停投递。`,
          'info',
        ),
      )
    }
  }

  if (triggeredRunDeliveryGuardrail) {
    warnings.push(
      createWarning(
        triggeredRunDeliveryGuardrail.code,
        triggeredRunDeliveryGuardrail.message,
        'warn',
      ),
    )
  } else if (runReached) {
    warnings.push(
      createWarning(
        runDeliveryGuardrailCode,
        `本轮投递已达到上限 ${runDeliveryGuardrailLimit}，请先 stop 当前 run，再重新 start 新的一轮。`,
        'warn',
      ),
    )
  } else if (!reached && remainingInRun > 0 && remainingInRun <= 3) {
    warnings.push(
      createWarning(
        'run-delivery-limit-nearby',
        `本轮剩余投递额度仅 ${remainingInRun} 次；达到 ${runDeliveryGuardrailLimit} 次后会自动暂停当前 run。`,
        'info',
      ),
    )
  }

  return {
    automation: {
      aiFilteringEnabled,
      aiFilteringExternal,
    },
    delivery: {
      limit: deliveryLimit,
      reached,
      remainingToday,
      remainingInRun,
      runLimit: runDeliveryGuardrailLimit,
      runReached,
      usedInRun,
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
      sessionDuplicates,
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
