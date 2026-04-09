import { reactiveComputed, watchThrottled } from '@vueuse/core'
import { defineStore } from 'pinia'

import { ref } from '#imports'
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

export const todayKey = 'local:web-geek-job-Today'
export const statisticsKey = 'local:web-geek-job-Statistics'

export const useStatistics = defineStore('statistics', () => {
  const date = getCurDay()

  const todayData = reactiveComputed<Statistics>(() => {
    return createStatisticsSnapshot(date)
  })

  const statisticsData = ref<Statistics[]>([])

  async function getStatistics(): Promise<string> {
    await updateStatistics()
    return JSON.stringify(jsonClone({ t: todayData, s: statisticsData.value }))
  }

  async function setStatistics(data: string) {
    const { t, s } = JSON.parse(data)
    const normalizedToday = normalizeStatistics(t, getCurDay())
    const normalizedHistory = Array.isArray(s)
      ? s.map((item) => normalizeStatistics(item, item?.date ?? getCurDay()))
      : []
    deepmerge(todayData, normalizedToday, { clone: false })
    statisticsData.value = normalizedHistory
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

  async function updateStatistics(curData = jsonClone(todayData)) {
    void counter.storageGet<Statistics[]>(statisticsKey, []).then((data) => {
      statisticsData.value = data.map((item) => normalizeStatistics(item, item?.date ?? getCurDay()))
    })

    const g = normalizeStatistics(await counter.storageGet(todayKey, curData), getCurDay())
    logger.debug('统计数据:', date, g)
    if (g.date === date) {
      deepmerge(todayData, g, { clone: false })
      return g
    }

    const statistics = (await counter.storageGet<Statistics[]>(statisticsKey, [])).map((item) =>
      normalizeStatistics(item, item?.date ?? getCurDay()),
    )

    const newStatistics = [g, ...statistics]
    await counter.storageSet(statisticsKey, newStatistics)
    await counter.storageSet(todayKey, curData)
    statisticsData.value = newStatistics
  }

  return {
    todayData,
    statisticsData,
    updateStatistics,
    getStatistics,
    setStatistics,
  }
})
