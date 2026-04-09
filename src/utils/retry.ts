export interface RetryContext {
  attempt: number
  delayMs: number
  nextAttempt: number
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open'

export interface RetryOptions {
  baseDelayMs?: number
  factor?: number
  maxDelayMs?: number
  onRetry?: (error: unknown, context: RetryContext) => void
  retries?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
  wait?: (ms: number) => Promise<void>
}

export interface CircuitBreakerOptions {
  failureThreshold?: number
  getNow?: () => number
  isFailure?: (error: unknown) => boolean
  openMs?: number
}

export interface CircuitBreaker {
  readonly state: CircuitBreakerState
  readonly openedUntil: number
  readonly failureCount: number
  reset: () => void
  run: <T>(operation: () => Promise<T>) => Promise<T>
}

export interface MinIntervalGate {
  readonly minIntervalMs: number
  readonly nextAvailableAt: number
  run: <T>(operation: () => Promise<T>) => Promise<T>
}

export interface RecoveryOptions extends RetryOptions {
  circuitBreaker?: CircuitBreaker
  minIntervalGate?: MinIntervalGate
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public retryAfterMs: number) {
    super(message)
    this.name = 'CircuitBreakerError'
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function isLikelyNetworkError(error: unknown) {
  const message = toErrorMessage(error).toLowerCase()
  return [
    'network',
    'failed to fetch',
    'fetch failed',
    'load failed',
    'econnreset',
    'ecanceled',
    'etimedout',
    'timeout',
    'timed out',
    'abort',
    'request timeout',
    '请求超时',
  ].some((token) => message.includes(token))
}

export function createCircuitBreaker(options: CircuitBreakerOptions = {}): CircuitBreaker {
  const getNow = options.getNow ?? (() => Date.now())
  const failureThreshold = Math.max(options.failureThreshold ?? 3, 1)
  const openMs = Math.max(options.openMs ?? 15_000, 1000)
  const isFailure = options.isFailure ?? (() => true)

  let state: CircuitBreakerState = 'closed'
  let failureCount = 0
  let openedUntil = 0

  const reset = () => {
    state = 'closed'
    failureCount = 0
    openedUntil = 0
  }

  return {
    get state() {
      return state
    },
    get failureCount() {
      return failureCount
    },
    get openedUntil() {
      return openedUntil
    },
    reset,
    async run<T>(operation: () => Promise<T>) {
      const now = getNow()
      if (state === 'open') {
        if (now < openedUntil) {
          throw new CircuitBreakerError('熔断器已打开，请稍后再试', openedUntil - now)
        }
        state = 'half-open'
      }

      try {
        const result = await operation()
        reset()
        return result
      } catch (error) {
        if (!isFailure(error)) {
          throw error
        }

        failureCount += 1
        if (state === 'half-open' || failureCount >= failureThreshold) {
          state = 'open'
          openedUntil = getNow() + openMs
        }
        throw error
      }
    },
  }
}

export function createMinIntervalGate(
  minIntervalMs: number,
  options: {
    getNow?: () => number
    wait?: (ms: number) => Promise<void>
  } = {},
): MinIntervalGate {
  const getNow = options.getNow ?? (() => Date.now())
  const waitFor = options.wait ?? wait
  const interval = Math.max(minIntervalMs, 0)

  let nextAvailableAt = 0
  let queue = Promise.resolve()

  return {
    get minIntervalMs() {
      return interval
    },
    get nextAvailableAt() {
      return nextAvailableAt
    },
    async run<T>(operation: () => Promise<T>) {
      const task = async () => {
        const now = getNow()
        const delayMs = Math.max(nextAvailableAt - now, 0)
        if (delayMs > 0) {
          await waitFor(delayMs)
        }

        nextAvailableAt = getNow() + interval
        return operation()
      }

      const runPromise = queue.then(task, task)
      queue = runPromise.then(
        () => undefined,
        () => undefined,
      )
      return runPromise
    },
  }
}

export async function retryAsync<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = 0,
    baseDelayMs = 500,
    factor = 2,
    maxDelayMs = 5000,
    shouldRetry = () => true,
    onRetry,
    wait: customWait = wait,
  } = options

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation(attempt)
    } catch (error) {
      if (attempt > retries || !shouldRetry(error, attempt)) {
        throw error
      }

      const delayMs = Math.min(baseDelayMs * factor ** (attempt - 1), maxDelayMs)
      onRetry?.(error, {
        attempt,
        delayMs,
        nextAttempt: attempt + 1,
      })
      await customWait(delayMs)
    }
  }
}

export async function runWithRecovery<T>(
  operation: (attempt: number) => Promise<T>,
  options: RecoveryOptions = {},
): Promise<T> {
  const execute = async () =>
    retryAsync(
      async (attempt) => {
        if (options.minIntervalGate) {
          return options.minIntervalGate.run(() => operation(attempt))
        }
        return operation(attempt)
      },
      options,
    )

  if (options.circuitBreaker) {
    return options.circuitBreaker.run(execute)
  }

  return execute()
}
