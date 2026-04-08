import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { JobStatus } from '@/stores/jobs'
import type { PipelineErrorContext } from '@/stores/log'
import { useUser } from '@/stores/user'
import { JobAddressError, UnknownError } from '@/types/deliverError'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'
import { amapDistance, amapGeocode } from '@/utils/amap'
import { logger } from '@/utils/logger'

import { handles } from './handles'
import type { Handler, Pipeline, Step } from './type'

export * from './utils'

const cacheManagers = new Map<string, PipelineCacheManager>()
const STEP_NAME_KEY = '__bossHelperStepName'

type StepMetaCarrier = {
  [STEP_NAME_KEY]?: string
}

function getStepName(step: Step): string {
  if (step == null) {
    return 'unknown-step'
  }
  const metaStep = step as StepMetaCarrier & { name?: string }
  return metaStep[STEP_NAME_KEY] ?? metaStep.name ?? 'anonymous-step'
}

function withStepName<T extends Step>(name: string, step: T): T {
  if (step == null) {
    return step
  }
  Object.defineProperty(step, STEP_NAME_KEY, {
    value: name,
    configurable: true,
  })
  return step
}

function toPipelineErrorContext(
  jobId: string,
  step: string,
  stage: 'before' | 'after',
  error: unknown,
): PipelineErrorContext {
  const rootCause = getRootCause(error)
  const currentError = toErrorLike(error)
  const rawError = toErrorLike(rootCause)

  return {
    jobId,
    step,
    stage,
    errorName: currentError.name,
    errorMessage: currentError.message,
    errorStack: currentError.stack,
    rawErrorName: rawError.name,
    rawErrorMessage: rawError.message,
    rawErrorStack: rawError.stack,
  }
}

function getRootCause(error: unknown): unknown {
  let current = error

  while (
    current instanceof Error
    && current.cause != null
    && current.cause !== current
  ) {
    current = current.cause
  }

  return current
}

function toErrorLike(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    name: typeof error,
    message: String(error),
  }
}

function wrapHandler(handler: Handler, step: string, stage: 'before' | 'after'): Handler {
  return async (args, ctx) => {
    try {
      await handler(args, ctx)
    } catch (error) {
      ctx.pipelineError = toPipelineErrorContext(args.data.encryptJobId, step, stage, error)
      logger.error('管线步骤失败', ctx.pipelineError, error)
      throw error
    }
  }
}

function getCurrentUserId() {
  try {
    return useUser().getUserId()
  } catch {
    return null
  }
}

function resolveCacheManagerKey(userId?: string | number | null): string {
  return userId == null ? 'anonymous' : String(userId)
}

function compilePipeline(
  pipeline: Pipeline,
  isNested = false,
): {
  before: Handler[]
  after: Handler[]
} {
  const result: {
    before: Handler[]
    after: Handler[]
  } = {
    before: [],
    after: [],
  }
  const pipelineQueue = [...pipeline]
  let guard: Step | undefined
  if (isNested) {
    const first = pipelineQueue.shift()
    if (Array.isArray(first)) {
      throw new TypeError('PipelineGroup 第一项不能是数组')
    }
    guard = first
  }
  for (const h of pipelineQueue) {
    if (h == null) {
      continue
    }
    if (Array.isArray(h)) {
      const { before, after } = compilePipeline(h, true)
      result.before.push(...before)
      result.after.push(...after)
    } else if (typeof h === 'function') {
      result.before.push(wrapHandler(h, getStepName(h), 'before'))
    } else {
      const stepName = getStepName(h)
      h.fn && result.before.push(wrapHandler(h.fn, stepName, 'before'))
      h.after && result.after.push(wrapHandler(h.after, stepName, 'after'))
    }
  }
  if (guard) {
    if (typeof guard === 'function') {
      result.before.length > 0 && result.before.unshift(wrapHandler(guard, getStepName(guard), 'before'))
    } else {
      const stepName = getStepName(guard)
      result.before.length > 0 && guard.fn && result.before.unshift(wrapHandler(guard.fn, stepName, 'before'))
      result.after.length > 0 && guard.after && result.after.unshift(wrapHandler(guard.after, stepName, 'after'))
    }
  }
  return result
}

export async function createHandle(): Promise<{
  before: Handler[]
  after: Handler[]
}> {
  const h = handles()
  const pipeline: Pipeline = [
    withStepName('communicated', h.communicated()), // 已沟通过滤
    withStepName('sameCompanyFilter', h.SameCompanyFilter()), // 相同公司过滤
    withStepName('sameHrFilter', h.SameHrFilter()), // 相同hr过滤
    withStepName('jobTitle', h.jobTitle()), // 岗位名筛选
    withStepName('company', h.company()), // 公司名筛选
    withStepName('salaryRange', h.salaryRange()), // 薪资筛选
    withStepName('companySizeRange', h.companySizeRange()), // 公司规模筛选
    withStepName('goldHunterFilter', h.goldHunterFilter()), // 猎头过滤
    [
      // Card卡片信息获取
      withStepName('loadCard', async (args) => {
        if (args.data.card == null) {
          if ((await args.data.getCard()) == null) {
            throw new UnknownError('Card 信息获取失败')
          }
        }
      }),
      withStepName('activityFilter', h.activityFilter()), // 活跃度过滤
      withStepName('hrPosition', h.hrPosition()), // Hr职位筛选
      withStepName('jobAddress', h.jobAddress()), // 工作地址筛选
      withStepName('jobFriendStatus', h.jobFriendStatus()), // 好友状态过滤
      withStepName('jobContent', h.jobContent()), // 工作内容筛选
      [
        // 高德地图
        withStepName('resolveAmap', async (args, ctx) => {
          ctx.amap ??= {}
          try {
            ctx.amap.geocode = await amapGeocode(
              args.data.card?.address ?? args.data.card?.jobInfo.address ?? '',
            ) // TODO: 直接使用经纬度
            if (!ctx.amap.geocode?.location) {
              throw new JobAddressError('未获取到地址经纬度')
            }
            ctx.amap.distance = await amapDistance(ctx.amap.geocode.location)
          } catch (e) {
            logger.error('高德地图错误', e)
            throw new JobAddressError(`错误: ${e instanceof Error ? e.message : '未知'}`, {
              cause: e instanceof Error ? e : undefined,
            })
          }
        }),
        withStepName('amap', h.amap()),
      ],
      withStepName('aiFiltering', h.aiFiltering()), // AI过滤
      withStepName('greeting', h.greeting()), // 招呼语
    ],
  ]
  return compilePipeline(pipeline)
}

/**
 * 创建缓存实例
 */
export function getCacheManager(userId = getCurrentUserId()): PipelineCacheManager {
  const cacheKey = resolveCacheManagerKey(userId)
  if (!cacheManagers.has(cacheKey)) {
    cacheManagers.set(cacheKey, new PipelineCacheManager())
  }
  return cacheManagers.get(cacheKey)!
}

/**
 * 缓存Pipeline处理结果
 */
export async function cachePipelineResult(
  encryptJobId: string,
  jobName: string,
  brandName: string,
  status: JobStatus,
  message: string,
  processorType?: ProcessorType,
): Promise<void> {
  const cacheManager = getCacheManager()
  await cacheManager.setCacheResult(
    encryptJobId,
    jobName,
    brandName,
    status,
    message,
    processorType,
  )
}

/**
 * 检查职位是否有有效缓存
 */
export function checkJobCache(encryptJobId: string): PipelineCacheItem | null {
  const cacheManager = getCacheManager()

  if (cacheManager.isValidCache(encryptJobId)) {
    const cached = cacheManager.getCachedResult(encryptJobId)
    return cached
  }
  return null
}
