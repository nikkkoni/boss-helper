// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStatistics } from '@/composables/useStatistics'

import { setupPinia } from './helpers/pinia'
import { __getStorageItem, __setStorageItem } from './mocks/message'

describe('useStatistics', () => {
  beforeEach(() => {
    setupPinia()
    vi.useRealTimers()
  })

  it('waits for persisted history before exposing statistics snapshots', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00'))

    __setStorageItem('local:web-geek-job-Today', {
      date: '2026-04-10',
      success: 2,
      total: 5,
    })
    __setStorageItem('local:web-geek-job-Statistics', [
      {
        date: '2026-04-09',
        success: 3,
        total: 8,
      },
    ])

    const stats = useStatistics()
    const snapshot = JSON.parse(await stats.getStatistics())

    expect(snapshot.t).toEqual(
      expect.objectContaining({
        date: '2026-04-10',
        success: 2,
        total: 5,
      }),
    )
    expect(snapshot.s).toEqual([
      expect.objectContaining({
        date: '2026-04-09',
        success: 3,
        total: 8,
      }),
    ])
  })

  it('rolls the current day over after midnight and archives the previous counters', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T23:59:50'))

    const stats = useStatistics()
    Object.assign(stats.todayData, {
      date: '2026-04-10',
      success: 4,
      total: 7,
    })

    vi.setSystemTime(new Date('2026-04-11T00:00:10'))

    await stats.updateStatistics()

    expect(stats.todayData).toEqual(
      expect.objectContaining({
        date: '2026-04-11',
        success: 0,
        total: 0,
      }),
    )
    expect(stats.statisticsData).toEqual([
      expect.objectContaining({
        date: '2026-04-10',
        success: 4,
        total: 7,
      }),
    ])
    expect(__getStorageItem('local:web-geek-job-Today')).toEqual(
      expect.objectContaining({
        date: '2026-04-11',
        success: 0,
        total: 0,
      }),
    )
    expect(__getStorageItem('local:web-geek-job-Statistics')).toEqual([
      expect.objectContaining({
        date: '2026-04-10',
        success: 4,
        total: 7,
      }),
    ])
  })
})
