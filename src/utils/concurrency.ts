type LimitedTask<T> = () => Promise<T> | T

interface TaskBatchEntry {
  expiresAt: number
  value: unknown
}

export interface ConcurrencyLimiter {
  activeCount: number
  pendingCount: number
  run<T>(task: LimitedTask<T>): Promise<T>
}

export function createConcurrencyLimiter(maxConcurrency = 1): ConcurrencyLimiter {
  const concurrency = Math.max(maxConcurrency, 1)
  let activeCount = 0
  const queue: Array<() => void> = []

  const next = () => {
    activeCount = Math.max(activeCount - 1, 0)
    queue.shift()?.()
  }

  return {
    get activeCount() {
      return activeCount
    },
    get pendingCount() {
      return queue.length
    },
    run<T>(task: LimitedTask<T>) {
      return new Promise<T>((resolve, reject) => {
        const execute = () => {
          activeCount++
          Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(next)
        }

        if (activeCount < concurrency) {
          execute()
          return
        }

        queue.push(execute)
      })
    },
  }
}

export function createTaskBatcher(defaultTtlMs = 0) {
  const inFlight = new Map<string, Promise<unknown>>()
  const recentResults = new Map<string, TaskBatchEntry>()

  function getCachedValue<T>(key: string) {
    const cached = recentResults.get(key)
    if (!cached) {
      return null
    }
    if (cached.expiresAt <= Date.now()) {
      recentResults.delete(key)
      return null
    }
    return cached.value as T
  }

  return {
    clear() {
      inFlight.clear()
      recentResults.clear()
    },
    run<T>(key: string, task: LimitedTask<T>, ttlMs = defaultTtlMs): Promise<T> {
      const cached = getCachedValue<T>(key)
      if (cached != null) {
        return Promise.resolve(cached)
      }

      const pending = inFlight.get(key)
      if (pending) {
        return pending as Promise<T>
      }

      const promise = Promise.resolve()
        .then(task)
        .then((value) => {
          if (ttlMs > 0) {
            recentResults.set(key, {
              expiresAt: Date.now() + ttlMs,
              value,
            })
          }
          return value
        })
        .finally(() => {
          inFlight.delete(key)
        })

      inFlight.set(key, promise)
      return promise
    },
  }
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    const view = globalThis.window
    if (!view || typeof view.requestAnimationFrame !== 'function') {
      resolve()
      return
    }
    view.requestAnimationFrame(() => resolve())
  })
}

function waitForIdle(timeoutMs = 120) {
  return new Promise<void>((resolve) => {
    const view = globalThis.window as (Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
    }) | undefined

    if (!view || typeof view.requestIdleCallback !== 'function') {
      setTimeout(resolve, 0)
      return
    }

    view.requestIdleCallback(() => resolve(), { timeout: timeoutMs })
  })
}

export async function scheduleDOMBatch() {
  await waitForAnimationFrame()
  await waitForIdle()
}

export const AI_MAX_CONCURRENCY = 1
export const DOM_BATCH_MAX_CONCURRENCY = 1
const AI_BATCH_CACHE_TTL_MS = 15_000

const aiLimiter = createConcurrencyLimiter(AI_MAX_CONCURRENCY)
const domBatchLimiter = createConcurrencyLimiter(DOM_BATCH_MAX_CONCURRENCY)
const aiBatcher = createTaskBatcher(AI_BATCH_CACHE_TTL_MS)

export function runLimitedAIRequest<T>(task: LimitedTask<T>) {
  return aiLimiter.run(task)
}

export function runBatchedAIRequest<T>(key: string, task: LimitedTask<T>) {
  return aiBatcher.run(key, () => runLimitedAIRequest(task))
}

export function runLimitedDOMBatch<T>(task: LimitedTask<T>) {
  return domBatchLimiter.run(async () => {
    await scheduleDOMBatch()
    return task()
  })
}
