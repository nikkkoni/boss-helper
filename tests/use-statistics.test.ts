// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { statisticsKey, todayKey, useStatistics } from '@/composables/useStatistics'

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

  it('normalizes imported snapshots and falls back to an empty history list', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-12T08:00:00'))

    const stats = useStatistics()

    await stats.setStatistics(JSON.stringify({
      s: { invalid: true },
      t: {
        success: 6,
        total: 9,
      },
    }))

    expect(stats.todayData).toEqual(
      expect.objectContaining({
        date: '2026-04-12',
        success: 6,
        total: 9,
      }),
    )
    expect(stats.statisticsData).toEqual([])
    expect(__getStorageItem(todayKey)).toEqual(
      expect.objectContaining({
        date: '2026-04-12',
        success: 6,
        total: 9,
      }),
    )
    expect(__getStorageItem(statisticsKey)).toEqual([])
  })

  it('rolls stale persisted data forward with provided counters on first load', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T09:00:00'))

    __setStorageItem(todayKey, {
      date: '2026-04-10',
      success: 2,
      total: 5,
    })
    __setStorageItem(statisticsKey, [
      {
        date: '2026-04-09',
        success: 1,
        total: 2,
      },
    ])

    const stats = useStatistics()
    const next = await stats.updateStatistics({
      aiFiltering: 3,
      success: 9,
      total: 11,
    })

    expect(next).toEqual(
      expect.objectContaining({
        aiFiltering: 3,
        date: '2026-04-11',
        success: 9,
        total: 11,
      }),
    )
    expect(stats.statisticsData).toEqual([
      expect.objectContaining({
        date: '2026-04-10',
        success: 2,
        total: 5,
      }),
      expect.objectContaining({
        date: '2026-04-09',
        success: 1,
        total: 2,
      }),
    ])
    expect(__getStorageItem(statisticsKey)).toEqual(stats.statisticsData)
  })

  it('reuses the current day after loading and rolls over stale imported data', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-12T09:00:00'))

    const stats = useStatistics()
    await stats.setStatistics(JSON.stringify({
      s: [
        {
          success: 1,
          total: 2,
        },
      ],
      t: {
        date: '2026-04-12',
        success: 4,
        total: 5,
      },
    }))

    const sameDay = await stats.updateStatistics()
    expect(sameDay).toBe(stats.todayData)
    expect(stats.statisticsData).toEqual([
      expect.objectContaining({
        date: '2026-04-12',
        success: 1,
        total: 2,
      }),
    ])

    vi.setSystemTime(new Date('2026-04-13T09:00:00'))

    const nextDay = await stats.updateStatistics({
      aiFiltering: 2,
      success: 7,
      total: 8,
    })

    expect(nextDay).toEqual(
      expect.objectContaining({
        aiFiltering: 2,
        date: '2026-04-13',
        success: 7,
        total: 8,
      }),
    )
    expect(stats.statisticsData).toEqual([
      expect.objectContaining({
        date: '2026-04-12',
        success: 4,
        total: 5,
      }),
      expect.objectContaining({
        date: '2026-04-12',
        success: 1,
        total: 2,
      }),
    ])
  })
})
