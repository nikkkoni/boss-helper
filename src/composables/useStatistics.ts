import { watchThrottled } from '@vueuse/core'
import { defineStore } from 'pinia'

import { reactive, ref } from '#imports'
import { counter } from '@/message'
import type { Statistics } from '@/types/formData'
import { getCurDay } from '@/utils'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

function createStatisticsSnapshot(date: string): Statistics {
  return {
    date,
    success: 0,
    total: 0,
    company: 0,
    jobTitle: 0,
    jobContent: 0,
    aiFiltering: 0,
    hrPosition: 0,
    salaryRange: 0,
    companySizeRange: 0,
    activityFilter: 0,
    goldHunterFilter: 0,
    repeat: 0,
    jobAddress: 0,
    amap: 0,
    aiRequestCount: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    aiTotalTokens: 0,
    aiTotalCost: 0,
  }
}

function normalizeStatistics(data: Partial<Statistics> | undefined, fallbackDate: string): Statistics {
  return {
    ...createStatisticsSnapshot(fallbackDate),
    ...(data ?? {}),
    date: data?.date ?? fallbackDate,
  }
}

function normalizeStatisticsHistory(data: Partial<Statistics>[] | null | undefined): Statistics[] {
  if (!Array.isArray(data)) {
    return []
  }

  return data.map((item) => normalizeStatistics(item, item?.date ?? getCurDay()))
}

function createCurrentStatisticsSnapshot(): Statistics {
  return createStatisticsSnapshot(getCurDay())
}

function createRolloverStatisticsSnapshot(data?: Partial<Statistics>): Statistics {
  const currentDate = getCurDay()
  return {
    ...createStatisticsSnapshot(currentDate),
    ...(data ?? {}),
    date: currentDate,
  }
}

export const todayKey = 'local:web-geek-job-Today'
export const statisticsKey = 'local:web-geek-job-Statistics'

export const useStatistics = defineStore('statistics', () => {
  const todayData = reactive<Statistics>(createCurrentStatisticsSnapshot())

  const statisticsData = ref<Statistics[]>([])
  let hasLoadedPersistedState = false

  function applyTodaySnapshot(snapshot: Statistics) {
    deepmerge(todayData, snapshot, { clone: false })
  }

  async function loadStatisticsHistory() {
    return normalizeStatisticsHistory(await counter.storageGet<Statistics[]>(statisticsKey, []))
  }

  async function getStatistics(): Promise<string> {
    await updateStatistics()
    return JSON.stringify(jsonClone({ t: todayData, s: statisticsData.value }))
  }

  async function setStatistics(data: string) {
    const { t, s } = JSON.parse(data)
    const normalizedToday = normalizeStatistics(t, getCurDay())
    const normalizedHistory = normalizeStatisticsHistory(s)
    applyTodaySnapshot(normalizedToday)
    statisticsData.value = normalizedHistory
    hasLoadedPersistedState = true
    await counter.storageSet(todayKey, normalizedToday)
    await counter.storageSet(statisticsKey, normalizedHistory)
  }

  watchThrottled(
    todayData,
    (v) => {
      void counter.storageSet(todayKey, jsonClone(v))
    },
    { throttle: 200 },
  )

  async function updateStatistics(curData?: Partial<Statistics>) {
    const currentDate = getCurDay()
    const history = await loadStatisticsHistory()

    if (!hasLoadedPersistedState) {
      const storedToday = normalizeStatistics(
        await counter.storageGet(todayKey, jsonClone(todayData)),
        currentDate,
      )

      hasLoadedPersistedState = true
      logger.debug('统计数据:', currentDate, storedToday)

      if (storedToday.date === currentDate) {
        statisticsData.value = history
        applyTodaySnapshot(storedToday)
        return storedToday
      }

      const nextToday = curData == null
        ? createCurrentStatisticsSnapshot()
        : createRolloverStatisticsSnapshot(curData)
      const newStatistics = [storedToday, ...history]

      await counter.storageSet(statisticsKey, newStatistics)
      await counter.storageSet(todayKey, nextToday)
      statisticsData.value = newStatistics
      applyTodaySnapshot(nextToday)
      return nextToday
    }

    logger.debug('统计数据:', currentDate, todayData)
    if (todayData.date === currentDate) {
      statisticsData.value = history
      return todayData
    }

    const archivedToday = normalizeStatistics(jsonClone(todayData), todayData.date)
    const nextToday = curData == null
      ? createCurrentStatisticsSnapshot()
      : createRolloverStatisticsSnapshot(curData)
    const newStatistics = [archivedToday, ...history]

    await counter.storageSet(statisticsKey, newStatistics)
    await counter.storageSet(todayKey, nextToday)
    statisticsData.value = newStatistics
    applyTodaySnapshot(nextToday)
    return nextToday
  }

  return {
    todayData,
    statisticsData,
    updateStatistics,
    getStatistics,
    setStatistics,
  }
})
