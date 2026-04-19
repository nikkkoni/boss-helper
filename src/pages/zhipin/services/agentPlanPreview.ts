import { createHandle } from '@/composables/useApplying'
import { useModel } from '@/composables/useModel'
import type {
  BossHelperAgentPlanConfigSummary,
  BossHelperAgentPlanIssue,
  BossHelperAgentPlanPreviewData,
  BossHelperAgentPlanPreviewItem,
  BossHelperAgentPlanPreviewPayload,
  BossHelperAgentPlanStage,
} from '@/message/agent'
import { useConf } from '@/stores/conf'
import { jobList, type JobStatus, type MyJobListData } from '@/stores/jobs'
import type { logData } from '@/stores/log'
import { useUser } from '@/stores/user'
import type { FormData } from '@/types/formData'
import { BossHelperError } from '@/types/deliverError'
import deepmerge, { jsonClone } from '@/utils/deepmerge'

import { createDailyStatisticsSnapshot, toAgentJobSummary } from '../shared/jobMapping'

type PreviewModelStore = {
  initModel?: () => Promise<unknown>
  modelData: Array<{ key: string }>
}

type PreviewPlanDependencies = {
  createHandleFn?: typeof createHandle
  jobs?: MyJobListData[]
  modelStore?: PreviewModelStore
  resolveCurrentUserId?: () => Promise<number | string | null>
  runtimeConfig?: FormData
}

type PreviewStatusSnapshot = {
  message: string
  status: JobStatus
}

function normalizeTargetJobIds(jobIds?: string[]) {
  if (!jobIds?.length) {
    return []
  }

  return [...new Set(jobIds.map((jobId) => jobId.trim()).filter(Boolean))]
}

function buildPreviewConfig(runtimeConfig: FormData, payload?: BossHelperAgentPlanPreviewPayload) {
  const config = jsonClone(runtimeConfig)
  if (payload?.configPatch && Object.keys(payload.configPatch).length > 0) {
    deepmerge(config, jsonClone(payload.configPatch), { clone: false })
  }
  return config
}

function resolveGreetingMode(config: FormData): BossHelperAgentPlanConfigSummary['greetingMode'] {
  if (config.aiGreeting.enable) {
    return 'ai'
  }
  if (config.customGreeting.enable) {
    return 'custom'
  }
  return 'none'
}

function buildPlanConfigSummary(options: {
  availableModelKeys: Set<string>
  config: FormData
  resetFiltered: boolean
  targetJobIds: string[]
}): BossHelperAgentPlanConfigSummary {
  const { availableModelKeys, config, resetFiltered, targetJobIds } = options
  const aiFilteringEnabled = config.aiFiltering.enable === true
  const aiFilteringExternal = aiFilteringEnabled && config.aiFiltering.externalMode === true
  const aiFilteringModelReady = !aiFilteringEnabled
    || (typeof config.aiFiltering.model === 'string' && availableModelKeys.has(config.aiFiltering.model))
  const greetingMode = resolveGreetingMode(config)
  const greetingModelReady = greetingMode !== 'ai'
    || (typeof config.aiGreeting.model === 'string' && availableModelKeys.has(config.aiGreeting.model))

  return {
    aiFilteringEnabled,
    aiFilteringExternal,
    aiFilteringModelReady,
    aiFilteringThreshold: aiFilteringEnabled ? (config.aiFiltering.score ?? null) : null,
    greetingMode,
    greetingModelReady,
    resetFiltered,
    targetJobIds,
  }
}

function buildRemainingSteps(config: BossHelperAgentPlanConfigSummary) {
  const steps: string[] = []

  if (config.aiFilteringEnabled) {
    steps.push(config.aiFilteringExternal ? 'external-ai-review' : 'ai-filtering')
  }

  steps.push('apply')

  if (config.greetingMode !== 'none' && config.greetingModelReady) {
    steps.push('greeting')
  }

  return steps
}

function createIssue(
  code: string,
  message: string,
  severity: BossHelperAgentPlanIssue['severity'],
  step?: string,
): BossHelperAgentPlanIssue {
  return {
    code,
    message,
    severity,
    ...(step ? { step } : {}),
  }
}

function toPlanStage(step?: string): BossHelperAgentPlanStage {
  switch (step) {
    case 'loadCard':
      return 'load-card'
    case 'resolveAmap':
    case 'amap':
      return 'amap'
    case 'aiFiltering':
      return 'ai-filtering'
    default:
      return 'filters'
  }
}

function cloneJobForPreview(item: MyJobListData, status: PreviewStatusSnapshot): MyJobListData {
  const previewStatus = {
    status: status.status,
    msg: status.message,
    setStatus: (nextStatus: JobStatus, nextMessage?: string) => {
      previewStatus.status = nextStatus
      previewStatus.msg = nextMessage ?? ''
    },
  }

  const previewJob = {
    ...item,
    status: previewStatus,
    card: item.card,
    getCard: async () => {
      const card = item.card ?? await item.getCard()
      previewJob.card = card as NonNullable<MyJobListData['card']>
      return card
    },
  }

  return previewJob
}

function resolvePreviewStatus(options: {
  hasTargetJobIds: boolean
  job: MyJobListData
  resetFiltered: boolean
}): PreviewStatusSnapshot {
  const { hasTargetJobIds, job, resetFiltered } = options
  const currentStatus = job.status.status

  if (currentStatus === 'success' || currentStatus === 'warn') {
    return {
      status: currentStatus,
      message: job.status.msg || '保持当前状态',
    }
  }

  if (!hasTargetJobIds) {
    return {
      status: 'wait',
      message: '等待中',
    }
  }

  if (currentStatus === 'pending' || resetFiltered) {
    return {
      status: 'wait',
      message: '等待中',
    }
  }

  return {
    status: currentStatus,
    message: job.status.msg || '保持当前状态',
  }
}

function createExistingStatusItem(job: MyJobListData, status: PreviewStatusSnapshot): BossHelperAgentPlanPreviewItem {
  if (status.status === 'success') {
    return {
      decision: 'skip',
      explain: '岗位已处于投递成功状态，真实 start 默认不会重复处理。',
      issues: [createIssue('already-delivered', status.message || '投递成功', 'info')],
      job: toAgentJobSummary(job),
      remainingSteps: [],
      stage: 'current-status',
    }
  }

  if (status.status === 'warn') {
    return {
      decision: 'skip',
      explain: '岗位已处于已过滤状态，真实 start 默认不会重置 warn 状态。',
      issues: [createIssue('already-filtered', status.message || '已过滤', 'warn')],
      job: toAgentJobSummary(job),
      remainingSteps: [],
      stage: 'current-status',
    }
  }

  return {
    decision: 'skip',
    explain: `岗位当前状态为 ${status.status}，若希望重新处理该岗位，请在定向执行时携带 resetFiltered。`,
    issues: [createIssue('status-not-wait', status.message || `当前状态为 ${status.status}`, 'warn')],
    job: toAgentJobSummary(job),
    remainingSteps: [],
    stage: 'current-status',
  }
}

function createTopLevelFailureItem(
  job: MyJobListData,
  message: string,
): BossHelperAgentPlanPreviewItem {
  return {
    decision: 'missing-info',
    explain: '当前预演链路未能完成初始化，无法可靠给出岗位处理结果。',
    issues: [createIssue('plan-preview-unavailable', message, 'error')],
    job: toAgentJobSummary(job),
    remainingSteps: [],
    stage: 'filters',
  }
}

function createPostFilterItem(options: {
  config: BossHelperAgentPlanConfigSummary
  job: MyJobListData
}): BossHelperAgentPlanPreviewItem {
  const { config, job } = options
  const remainingSteps = buildRemainingSteps(config)

  if (config.aiFilteringEnabled) {
    if (config.aiFilteringExternal) {
      return {
        decision: 'needs-external-review',
        explain: '岗位已通过当前只读前置过滤，下一步需要外部 AI 审核后才能继续执行。',
        issues: [
          createIssue(
            'external-ai-review-required',
            `AI 筛选已配置为 externalMode，阈值 ${config.aiFilteringThreshold ?? '未设置'}`,
            'info',
            'aiFiltering',
          ),
        ],
        job: toAgentJobSummary(job),
        remainingSteps,
        stage: 'ai-filtering',
      }
    }

    if (!config.aiFilteringModelReady) {
      return {
        decision: 'missing-info',
        explain: '岗位已通过当前只读前置过滤，但当前没有可用的 AI 筛选模型，无法继续模拟最终决策。',
        issues: [
          createIssue(
            'ai-filtering-model-missing',
            '未找到 AI 筛选模型，或模型尚未初始化。',
            'error',
            'aiFiltering',
          ),
        ],
        job: toAgentJobSummary(job),
        remainingSteps,
        stage: 'ai-filtering',
      }
    }

    return {
      decision: 'needs-manual-review',
      explain: '岗位已通过当前只读前置过滤；为保持 preview 无副作用，本次未实际调用内部 AI 筛选。',
      issues: [
        createIssue(
          'internal-ai-filtering-pending',
          `仍需执行内部 AI 筛选，阈值 ${config.aiFilteringThreshold ?? '未设置'}`,
          'info',
          'aiFiltering',
        ),
      ],
      job: toAgentJobSummary(job),
      remainingSteps,
      stage: 'ai-filtering',
    }
  }

  const issues: BossHelperAgentPlanIssue[] = []
  if (config.greetingMode === 'ai' && !config.greetingModelReady) {
    issues.push(
      createIssue(
        'ai-greeting-model-missing',
        'AI 招呼语模型不可用；实际执行时仍可投递，但不会生成 AI 招呼语。',
        'info',
      ),
    )
  }

  return {
    decision: 'ready',
    explain: '岗位已通过当前只读前置过滤，可以直接进入真实投递链路。',
    issues,
    job: toAgentJobSummary(job),
    remainingSteps,
    stage: 'ready',
  }
}

function createFailureItem(options: {
  error: unknown
  job: MyJobListData
  ctx: logData
}): BossHelperAgentPlanPreviewItem {
  const { error, job, ctx } = options
  const message = error instanceof Error ? error.message : String(error)
  const step = ctx.pipelineError?.step

  if (step === 'loadCard') {
    return {
      decision: 'missing-info',
      explain: '岗位详情卡片读取失败，当前无法在只读模式下完成后续过滤判断。',
      issues: [createIssue('job-card-unavailable', message, 'error', step)],
      job: toAgentJobSummary(job),
      remainingSteps: [],
      stage: 'load-card',
    }
  }

  if (step === 'resolveAmap') {
    return {
      decision: 'missing-info',
      explain: '岗位地址解析失败，当前无法给出稳定的地图距离判断。',
      issues: [createIssue('location-unavailable', message, 'error', step)],
      job: toAgentJobSummary(job),
      remainingSteps: [],
      stage: 'amap',
    }
  }

  if (error instanceof BossHelperError && error.state === 'warning') {
    return {
      decision: 'skip',
      explain: `岗位会在前置过滤阶段被跳过：${message}`,
      issues: [
        createIssue(
          step ? `filtered-${step}` : 'filtered-before-apply',
          message,
          'warn',
          step,
        ),
      ],
      job: toAgentJobSummary(job),
      remainingSteps: [],
      stage: toPlanStage(step),
    }
  }

  return {
    decision: 'missing-info',
    explain: '岗位在只读预演阶段触发了未归类错误，当前无法给出稳定的执行结论。',
    issues: [
      createIssue(step ? `preview-${step}-failed` : 'preview-failed', message, 'error', step),
    ],
    job: toAgentJobSummary(job),
    remainingSteps: [],
    stage: toPlanStage(step),
  }
}

function summarizePlan(items: BossHelperAgentPlanPreviewItem[], totalOnPage: number, unknownTargetJobIds: string[]) {
  return items.reduce<BossHelperAgentPlanPreviewData['summary']>((summary, item) => {
    switch (item.decision) {
      case 'ready':
        summary.readyCount += 1
        break
      case 'skip':
        summary.skipCount += 1
        break
      case 'missing-info':
        summary.missingInfoCount += 1
        break
      case 'needs-manual-review':
        summary.needsManualReviewCount += 1
        break
      case 'needs-external-review':
        summary.needsExternalReviewCount += 1
        break
    }

    return summary
  }, {
    missingInfoCount: 0,
    needsExternalReviewCount: 0,
    needsManualReviewCount: 0,
    readyCount: 0,
    scopedCount: items.length,
    skipCount: 0,
    totalOnPage,
    unknownTargetJobIds,
  })
}

async function resolvePreviewCurrentUserId(
  deps: PreviewPlanDependencies,
  previewConfig: FormData,
): Promise<number | string | null> {
  if (previewConfig.userId != null) {
    return previewConfig.userId
  }

  if (deps.resolveCurrentUserId) {
    return deps.resolveCurrentUserId()
  }

  try {
    const user = useUser()
    let currentUserId = user.getUserScopeId()
    if (currentUserId == null) {
      await user.initUser()
      currentUserId = user.getUserScopeId()
    }
    return currentUserId ?? null
  } catch {
    return null
  }
}

export async function previewAgentPlan(
  payload?: BossHelperAgentPlanPreviewPayload,
  deps: PreviewPlanDependencies = {},
): Promise<BossHelperAgentPlanPreviewData> {
  const targetJobIds = normalizeTargetJobIds(payload?.jobIds)
  const targetJobIdSet = targetJobIds.length > 0 ? new Set(targetJobIds) : null
  const allJobs = deps.jobs ?? jobList.list
  const scopedJobs = targetJobIdSet
    ? allJobs.filter((item) => targetJobIdSet.has(item.encryptJobId))
    : [...allJobs]
  const unknownTargetJobIds = targetJobIds.filter(
    (jobId) => !scopedJobs.some((item) => item.encryptJobId === jobId),
  )
  const runtimeConfig = deps.runtimeConfig ?? useConf().getRuntimeConfigSnapshot()
  const previewConfig = buildPreviewConfig(runtimeConfig, payload)
  const modelStore = deps.modelStore ?? useModel()
  await modelStore.initModel?.()

  const configSummary = buildPlanConfigSummary({
    availableModelKeys: new Set((modelStore.modelData ?? []).map((item) => item.key)),
    config: previewConfig,
    resetFiltered: payload?.resetFiltered === true,
    targetJobIds,
  })
  const currentUserId = await resolvePreviewCurrentUserId(deps, previewConfig)

  let pipeline: Awaited<ReturnType<typeof createHandle>> | null = null
  let pipelineBuildError: string | null = null

  try {
    pipeline = await (deps.createHandleFn ?? createHandle)({
      ...(currentUserId == null ? {} : { currentUserId }),
      formData: previewConfig,
      includeAiFiltering: false,
      includeGreeting: false,
      statistics: {
        todayData: createDailyStatisticsSnapshot(new Date().toISOString().slice(0, 10)),
      },
    })
  } catch (error) {
    pipelineBuildError = error instanceof Error ? error.message : String(error)
  }

  const items: BossHelperAgentPlanPreviewItem[] = []
  for (const job of scopedJobs) {
    const previewStatus = resolvePreviewStatus({
      hasTargetJobIds: targetJobIdSet != null,
      job,
      resetFiltered: payload?.resetFiltered === true,
    })
    const previewJob = cloneJobForPreview(job, previewStatus)

    if (previewStatus.status !== 'wait') {
      items.push(createExistingStatusItem(previewJob, previewStatus))
      continue
    }

    if (pipelineBuildError || pipeline == null) {
      items.push(createTopLevelFailureItem(previewJob, pipelineBuildError ?? 'preview pipeline unavailable'))
      continue
    }

    const ctx: logData = { listData: previewJob }
    try {
      for (const step of pipeline.before) {
        await step({ data: previewJob }, ctx)
      }
      items.push(createPostFilterItem({
        config: configSummary,
        job: previewJob,
      }))
    } catch (error) {
      items.push(createFailureItem({
        error,
        job: previewJob,
        ctx,
      }))
    }
  }

  return {
    config: configSummary,
    items,
    summary: summarizePlan(items, allJobs.length, unknownTargetJobIds),
  }
}
