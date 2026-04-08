export interface RetryContext {
  attempt: number
  delayMs: number
  nextAttempt: number
}

export interface RetryOptions {
  baseDelayMs?: number
  factor?: number
  maxDelayMs?: number
  onRetry?: (error: unknown, context: RetryContext) => void
  retries?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
  wait?: (ms: number) => Promise<void>
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
