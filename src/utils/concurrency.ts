type LimitedTask<T> = () => Promise<T> | T

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

export const AI_MAX_CONCURRENCY = 1
export const DOM_BATCH_MAX_CONCURRENCY = 1

const aiLimiter = createConcurrencyLimiter(AI_MAX_CONCURRENCY)
const domBatchLimiter = createConcurrencyLimiter(DOM_BATCH_MAX_CONCURRENCY)

export function runLimitedAIRequest<T>(task: LimitedTask<T>) {
  return aiLimiter.run(task)
}

export function runLimitedDOMBatch<T>(task: LimitedTask<T>) {
  return domBatchLimiter.run(task)
}
