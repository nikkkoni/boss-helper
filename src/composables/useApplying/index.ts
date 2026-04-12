import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { JobStatus } from '@/stores/jobs'
import { useUser } from '@/stores/user'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'

import { createApplyingPipeline, type CreateApplyingPipelineOptions } from './services/pipelineFactory'

export * from './utils'
export type { CreateApplyingPipelineOptions } from './services/pipelineFactory'

const cacheManagers = new Map<string, PipelineCacheManager>()
const cacheManagerAccessQueue: string[] = []
const MAX_CACHE_MANAGERS = 8

function rememberCacheManagerAccess(cacheKey: string) {
  const existingIndex = cacheManagerAccessQueue.indexOf(cacheKey)
  if (existingIndex >= 0) {
    cacheManagerAccessQueue.splice(existingIndex, 1)
  }
  cacheManagerAccessQueue.push(cacheKey)
}

function evictCacheManagerIfNeeded(activeCacheKey: string) {
  while (cacheManagers.size > MAX_CACHE_MANAGERS) {
    const oldestCacheKey = cacheManagerAccessQueue.shift()
    if (!oldestCacheKey) {
      return
    }
    if (oldestCacheKey === activeCacheKey) {
      cacheManagerAccessQueue.push(oldestCacheKey)
      continue
    }
    cacheManagers.delete(oldestCacheKey)
  }
}

function getCurrentUserId() {
  try {
    return useUser().getUserScopeId()
  } catch {
    return null
  }
}

function resolveCacheManagerKey(userId?: string | number | null): string {
  return userId == null ? 'anonymous' : String(userId)
}

export async function createHandle(options: CreateApplyingPipelineOptions = {}): Promise<{
  before: Awaited<ReturnType<typeof createApplyingPipeline>>['before']
  after: Awaited<ReturnType<typeof createApplyingPipeline>>['after']
}> {
  return createApplyingPipeline(options)
}

/**
 * 创建缓存实例
 */
export function getCacheManager(userId = getCurrentUserId()): PipelineCacheManager {
  const cacheKey = resolveCacheManagerKey(userId)
  if (!cacheManagers.has(cacheKey)) {
    cacheManagers.set(cacheKey, new PipelineCacheManager())
  }
  rememberCacheManagerAccess(cacheKey)
  evictCacheManagerIfNeeded(cacheKey)
  return cacheManagers.get(cacheKey)!
}

export async function getReadyCacheManager(userId = getCurrentUserId()): Promise<PipelineCacheManager> {
  const cacheManager = getCacheManager(userId)
  await cacheManager.ensureReady()
  return cacheManager
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
  const cacheManager = await getReadyCacheManager()
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
