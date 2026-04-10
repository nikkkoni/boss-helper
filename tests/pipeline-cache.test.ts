// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PipelineCacheManager } from '@/composables/usePipelineCache'

import { counter, __getStorageItem, __setStorageItem } from './mocks/message'

describe('PipelineCacheManager', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stores successful results and updates hit counters on cache hit', async () => {
    const manager = new PipelineCacheManager({
      cleanupInterval: 60_000,
      maxCacheSize: 10,
      storageKey: 'local:test-cache',
    })

    await manager.setCacheResult('job-1', 'Frontend', 'Acme', 'success', '处理完成')

    expect(manager.isValidCache('job-1')).toBe(true)

    const cached = manager.getCachedResult('job-1')
    expect(cached).toEqual(
      expect.objectContaining({
        brandName: 'Acme',
        encryptJobId: 'job-1',
        hitCount: 1,
        processorType: 'basic',
      }),
    )
  })

  it('batches cache-hit persistence instead of saving on every read', async () => {
    vi.useFakeTimers()

    const storageSetSpy = vi.spyOn(counter, 'storageSet')
    const manager = new PipelineCacheManager({
      cleanupInterval: 60_000,
      maxCacheSize: 10,
      storageKey: 'local:test-hit-batch',
    })

    await manager.setCacheResult('job-1', 'Frontend', 'Acme', 'success', '处理完成')
    storageSetSpy.mockClear()

    manager.getCachedResult('job-1')
    const cached = manager.getCachedResult('job-1')

    expect(cached?.hitCount).toBe(2)
    expect(storageSetSpy).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()

    expect(storageSetSpy).toHaveBeenCalledTimes(1)
  })

  it('does not cache error results and evicts expired entries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-08T00:00:00Z'))

    const manager = new PipelineCacheManager({
      cleanupInterval: 1,
      processorConfigs: {
        aiFiltering: { expireTime: 10 },
        amap: { expireTime: 10 },
        basic: { expireTime: 10 },
      },
      storageKey: 'local:test-expire',
    })

    await manager.setCacheResult('job-error', 'Err', 'Acme', 'error', '失败')
    expect(manager.getCachedResult('job-error')).toBeNull()

    await manager.setCacheResult('job-1', 'Frontend', 'Acme', 'success', '处理完成')
    vi.setSystemTime(new Date('2026-04-08T00:00:01Z'))

    expect(manager.isValidCache('job-1')).toBe(false)
    expect(manager.getCachedResult('job-1')).toBeNull()
  })

  it('loads persisted cache and evicts the least recently used items when over size', async () => {
    __setStorageItem('local:test-lru', {
      data: {
        old: {
          brandName: 'Old Inc',
          createdAt: 1,
          encryptJobId: 'old',
          expireAt: Date.now() + 60_000,
          hitCount: 0,
          jobName: 'Old Job',
          lastAccessed: 1,
          message: 'old',
          processorType: 'basic',
          status: 'success',
        },
        new: {
          brandName: 'New Inc',
          createdAt: 2,
          encryptJobId: 'new',
          expireAt: Date.now() + 60_000,
          hitCount: 0,
          jobName: 'New Job',
          lastAccessed: 100,
          message: 'new',
          processorType: 'basic',
          status: 'success',
        },
      },
      lastCleanup: Date.now(),
    })

    const manager = new PipelineCacheManager({
      maxCacheSize: 1,
      storageKey: 'local:test-lru',
    })

    await vi.waitFor(() => {
      expect(manager.getCachedResult('new')).not.toBeNull()
    })

    expect(manager.getCachedResult('old')).toBeNull()
    expect(__getStorageItem('local:test-lru')).toEqual(
      expect.objectContaining({
        data: {
          new: expect.any(Object),
        },
      }),
    )
  })

  it('waits for persisted cache before allowing writes', async () => {
    vi.useFakeTimers()

    const storageGetSpy = vi.spyOn(counter, 'storageGet')
    const storageSetSpy = vi.spyOn(counter, 'storageSet')
    const persistedCache = {
      data: {
        persisted: {
          brandName: 'Persisted Inc',
          createdAt: 1,
          encryptJobId: 'persisted',
          expireAt: Date.now() + 60_000,
          hitCount: 0,
          jobName: 'Persisted Job',
          lastAccessed: 1,
          message: 'persisted',
          processorType: 'basic',
          status: 'success',
        },
      },
      lastCleanup: Date.now(),
    }

    storageGetSpy.mockImplementation(async (key: string, defaultValue?: unknown) => {
      if (key === 'local:test-ready') {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return structuredClone(persistedCache)
      }

      return structuredClone(defaultValue ?? null)
    })

    const manager = new PipelineCacheManager({
      cleanupInterval: 60_000,
      maxCacheSize: 10,
      storageKey: 'local:test-ready',
    })

    const writePromise = manager.setCacheResult('job-1', 'Frontend', 'Acme', 'success', '处理完成')

    await Promise.resolve()

    expect(storageSetSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(20)
    await writePromise

    expect(manager.getCachedResult('persisted')).toEqual(
      expect.objectContaining({
        brandName: 'Persisted Inc',
        encryptJobId: 'persisted',
      }),
    )
    expect(manager.getCachedResult('job-1')).toEqual(
      expect.objectContaining({
        brandName: 'Acme',
        encryptJobId: 'job-1',
      }),
    )
  })

  it('clearCache removes all persisted items', async () => {
    const manager = new PipelineCacheManager({ storageKey: 'local:test-clear' })

    await manager.setCacheResult('job-1', 'Frontend', 'Acme', 'success', 'AI 分数 90')
    await manager.clearCache()

    expect(await counter.storageGet('local:test-clear')).toEqual(
      expect.objectContaining({
        data: {},
      }),
    )
  })
})
