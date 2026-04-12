import { counter } from '@/message'
import { useUser } from '@/stores/user'
import { RepeatError } from '@/types/deliverError'

import type { StepFactory } from '../../type'
import type { ApplyingStatistics } from './shared'

export function createCommunicatedStep(statistics: ApplyingStatistics): StepFactory {
  return () => {
    return async ({ data }) => {
      if (!data.contact) {
        return
      }
      statistics.todayData.repeat++
      throw new RepeatError('已经沟通过')
    }
  }
}

export function createDuplicateFilter(options: {
  enabled: () => boolean
  errorMessage: string
  getId: (data: bossZpJobItemData) => string | null | undefined
  statistics: ApplyingStatistics
  storageKey: string
  userId: number | string | null
}): StepFactory {
  return () => {
    if (!options.enabled()) {
      return
    }

    let cache: Set<string> | null = null
    let dirtyCount = 0
    if (options.userId == null) {
      throw new RepeatError('没有获取到uid')
    }
    const userId = String(options.userId)

    return {
      fn: async ({ data }) => {
        if (cache == null) {
          const stored = await counter.storageGet<Record<string, string[]>>(options.storageKey, {})
          cache = new Set(stored[userId] ?? [])
        }

        const id = options.getId(data)
        if (id != null && cache.has(id)) {
          options.statistics.todayData.repeat++
          throw new RepeatError(options.errorMessage)
        }
      },
      after: async ({ data }) => {
        const id = options.getId(data)
        if (id != null) {
          cache?.add(id)
        }

        dirtyCount++
        if (dirtyCount <= 3) {
          return
        }

        const stored = await counter.storageGet<Record<string, string[]>>(options.storageKey, {})
        await counter.storageSet(options.storageKey, {
          ...stored,
          [userId]: Array.from(cache ?? []),
        })
        dirtyCount = 0
      },
    }
  }
}

export function getCurrentApplyingUserId() {
  return useUser().getUserScopeId()
}
