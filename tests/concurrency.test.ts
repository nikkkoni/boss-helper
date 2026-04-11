// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createConcurrencyLimiter,
  createTaskBatcher,
  scheduleDOMBatch,
} from '@/utils/concurrency'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createConcurrencyLimiter', () => {
  it('queues work once the concurrency limit is reached', async () => {
    const limiter = createConcurrencyLimiter(1)
    const firstTask = deferred<string>()
    const events: string[] = []

    const first = limiter.run(async () => {
      events.push('first:start')
      return firstTask.promise
    })
    const second = limiter.run(async () => {
      events.push('second:start')
      return 'second'
    })

    await Promise.resolve()

    expect(limiter.activeCount).toBe(1)
    expect(limiter.pendingCount).toBe(1)
    expect(events).toEqual(['first:start'])

    firstTask.resolve('first')

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second'])
    expect(events).toEqual(['first:start', 'second:start'])
    expect(limiter.activeCount).toBe(0)
    expect(limiter.pendingCount).toBe(0)
  })
})

describe('createTaskBatcher', () => {
  it('deduplicates in-flight work for the same key', async () => {
    const batcher = createTaskBatcher()
    const task = vi.fn(async () => 'shared-result')

    await expect(Promise.all([batcher.run('same-key', task), batcher.run('same-key', task)])).resolves.toEqual([
      'shared-result',
      'shared-result',
    ])

    expect(task).toHaveBeenCalledTimes(1)
  })

  it('reuses cached falsy results within the ttl window', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const batcher = createTaskBatcher(1_000)
    const task = vi.fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(9)

    await expect(batcher.run('zero', task)).resolves.toBe(0)
    await expect(batcher.run('zero', task)).resolves.toBe(0)

    await expect(batcher.run('false', task)).resolves.toBe(false)
    await expect(batcher.run('false', task)).resolves.toBe(false)

    await expect(batcher.run('empty', task)).resolves.toBe('')
    await expect(batcher.run('empty', task)).resolves.toBe('')

    now += 2_000
    await expect(batcher.run('zero', task)).resolves.toBe(9)

    expect(task).toHaveBeenCalledTimes(4)
  })

  it('expires cached values after the ttl window', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const batcher = createTaskBatcher(100)
    const task = vi.fn()
      .mockResolvedValueOnce('cached')
      .mockResolvedValueOnce('fresh')

    await expect(batcher.run('ttl', task)).resolves.toBe('cached')
    now += 50
    await expect(batcher.run('ttl', task)).resolves.toBe('cached')
    now += 51
    await expect(batcher.run('ttl', task)).resolves.toBe('fresh')

    expect(task).toHaveBeenCalledTimes(2)
  })

  it('writes the cache once for concurrent callers and reuses it afterwards', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const batcher = createTaskBatcher(1_000)
    const task = vi.fn(async () => ({ value: 'cached' }))

    const [first, second] = await Promise.all([
      batcher.run('shared-cache', task),
      batcher.run('shared-cache', task),
    ])

    expect(first).toEqual({ value: 'cached' })
    expect(second).toEqual({ value: 'cached' })
    expect(task).toHaveBeenCalledTimes(1)

    now += 10
    await expect(batcher.run('shared-cache', task)).resolves.toEqual({ value: 'cached' })
    expect(task).toHaveBeenCalledTimes(1)
  })
})

describe('scheduleDOMBatch', () => {
  it('waits for animation frame before idle time', async () => {
    const order: string[] = []

    vi.stubGlobal('window', {
      ...window,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        order.push('raf')
        callback(0)
        return 1
      },
      requestIdleCallback: (callback: () => void) => {
        order.push('idle')
        callback()
        return 1
      },
    })

    await scheduleDOMBatch()

    expect(order).toEqual(['raf', 'idle'])
  })
})

describe('limited concurrency wrappers', () => {
  it('serializes AI requests through the shared limiter', async () => {
    vi.resetModules()
    const { runLimitedAIRequest } = await import('@/utils/concurrency')
    const firstTask = deferred<string>()
    const events: string[] = []

    const first = runLimitedAIRequest(async () => {
      events.push('first:start')
      return firstTask.promise
    })
    const second = runLimitedAIRequest(async () => {
      events.push('second:start')
      return 'second'
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])

    firstTask.resolve('first')

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second'])
    expect(events).toEqual(['first:start', 'second:start'])
  })

  it('schedules DOM work before executing a limited DOM batch', async () => {
    vi.resetModules()
    const order: string[] = []
    vi.stubGlobal('window', {
      ...window,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        order.push('raf')
        callback(0)
        return 1
      },
      requestIdleCallback: (callback: () => void) => {
        order.push('idle')
        callback()
        return 1
      },
    })
    const { runLimitedDOMBatch } = await import('@/utils/concurrency')

    await expect(
      runLimitedDOMBatch(async () => {
        order.push('task')
        return 'done'
      }),
    ).resolves.toBe('done')

    expect(order).toEqual(['raf', 'idle', 'task'])
  })
})
