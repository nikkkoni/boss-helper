import type { PipelineErrorContext } from '@/stores/log'
import { logger } from '@/utils/logger'

import type { Handler, Pipeline, Step } from '../type'

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

/**
 * 给步骤附加稳定名字，便于日志、错误上下文和调试输出定位具体 pipeline 节点。
 */
export function withStepName<T extends Step>(name: string, step: T): T {
  if (step == null) {
    return step
  }
  Object.defineProperty(step, STEP_NAME_KEY, {
    value: name,
    configurable: true,
  })
  return step
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

/**
 * 把嵌套 pipeline 编译成线性的 before / after 队列。
 *
 * 编译时会保留步骤名，并在每个步骤外层注入统一错误包装，确保日志里能拿到
 * `jobId + step + stage + root cause` 这组上下文。
 */
export function compilePipeline(
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
