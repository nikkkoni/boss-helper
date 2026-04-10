import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { JobStatus } from '@/stores/jobs'
import { useUser } from '@/stores/user'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'

import { createApplyingPipeline } from './services/pipelineFactory'

export * from './utils'

const cacheManagers = new Map<string, PipelineCacheManager>()

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

export async function createHandle(): Promise<{
  before: Awaited<ReturnType<typeof createApplyingPipeline>>['before']
  after: Awaited<ReturnType<typeof createApplyingPipeline>>['after']
}> {
  return createApplyingPipeline()
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
