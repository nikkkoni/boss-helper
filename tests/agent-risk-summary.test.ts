import { describe, expect, it } from 'vitest'

import { buildAgentRiskSummary } from '@/pages/zhipin/shared/riskSummary'
import { defaultFormData } from '@/stores/conf/info'
import { jsonClone } from '@/utils/deepmerge'

describe('buildAgentRiskSummary', () => {
  it('reports high risk when duplicate guardrails are weak and delivery volume is aggressive', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 150
    config.sameCompanyFilter.value = false
    config.sameHrFilter.value = false
    config.friendStatus.value = false
    config.notification.value = false
    config.useCache.value = false

    const result = buildAgentRiskSummary({
      config,
      progress: {
        state: 'running',
        stopRequested: false,
      },
      todayData: {
        ...jsonClone({
          date: '2026-04-13',
          success: 149,
          total: 160,
          company: 0,
          jobTitle: 0,
          jobContent: 0,
          aiFiltering: 0,
          hrPosition: 0,
          jobAddress: 0,
          salaryRange: 0,
          amap: 0,
          companySizeRange: 0,
          activityFilter: 0,
          goldHunterFilter: 0,
          repeat: 6,
        }),
      },
    })

    expect(result.level).toBe('high')
    expect(result.delivery).toEqual({
      limit: 150,
      reached: false,
      remainingToday: 1,
      remainingInRun: 20,
      runLimit: 20,
      runReached: false,
      usedInRun: 0,
      usedToday: 149,
    })
    expect(result.observed).toEqual({
      deliveredToday: 149,
      processedToday: 160,
      repeatFilteredToday: 6,
      sessionDuplicates: {
        communicated: 0,
        other: 0,
        sameCompany: 0,
        sameHr: 0,
      },
    })
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'high-delivery-limit', severity: 'warn' }),
        expect.objectContaining({ code: 'duplicate-guardrails-weakened', severity: 'warn' }),
        expect.objectContaining({ code: 'delivery-limit-nearby', severity: 'info' }),
      ]),
    )
  })

  it('reports low risk when conservative guardrails are enabled', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 80
    config.sameCompanyFilter.value = true
    config.sameHrFilter.value = true
    config.friendStatus.value = true
    config.notification.value = true
    config.useCache.value = true

    const result = buildAgentRiskSummary({
      config,
      progress: {
        state: 'idle',
        stopRequested: false,
      },
      todayData: {
        date: '2026-04-13',
        success: 12,
        total: 20,
        company: 0,
        jobTitle: 0,
        jobContent: 0,
        aiFiltering: 0,
        hrPosition: 0,
        jobAddress: 0,
        salaryRange: 0,
        amap: 0,
        companySizeRange: 0,
        activityFilter: 0,
        goldHunterFilter: 0,
        repeat: 1,
      },
    })

    expect(result.level).toBe('low')
    expect(result.warnings).toEqual([])
    expect(result.guardrails).toEqual({
      friendStatus: true,
      notification: true,
      sameCompanyFilter: true,
      sameHrFilter: true,
      useCache: true,
    })
  })

  it('surfaces an interval warning when random delivery offset is disabled', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 80
    config.sameCompanyFilter.value = true
    config.sameHrFilter.value = true
    config.friendStatus.value = true
    config.notification.value = true
    config.useCache.value = true
    config.delay.deliveryInterval = 5
    config.delay.deliveryIntervalRandomOffset = 0

    const result = buildAgentRiskSummary({
      config,
      progress: {
        state: 'idle',
        stopRequested: false,
      },
      todayData: {
        date: '2026-04-13',
        success: 12,
        total: 20,
        company: 0,
        jobTitle: 0,
        jobContent: 0,
        aiFiltering: 0,
        hrPosition: 0,
        jobAddress: 0,
        salaryRange: 0,
        amap: 0,
        companySizeRange: 0,
        activityFilter: 0,
        goldHunterFilter: 0,
        repeat: 1,
      },
    })

    expect(result.level).toBe('medium')
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'delivery-interval-randomization-disabled',
        severity: 'info',
      }),
    )
  })

  it('breaks down duplicate guardrail hits from current-session logs', () => {
    const config = jsonClone(defaultFormData)
    const result = buildAgentRiskSummary({
      config,
      logs: [
        {
          createdAt: '2026-04-13T09:00:00.000Z',
          message: '已经沟通过',
          state_name: '重复沟通',
        },
        {
          createdAt: '2026-04-13T09:01:00.000Z',
          message: '相同公司已投递',
          state_name: '重复沟通',
        },
        {
          createdAt: '2026-04-13T09:02:00.000Z',
          message: '相同hr已投递',
          state_name: '重复沟通',
        },
        {
          createdAt: '2026-04-13T09:03:00.000Z',
          message: '没有获取到uid',
          state_name: '重复沟通',
        },
        {
          createdAt: '2026-04-12T09:03:00.000Z',
          message: '相同公司已投递',
          state_name: '重复沟通',
        },
      ],
      progress: {
        state: 'idle',
        stopRequested: false,
      },
      todayData: {
        date: '2026-04-13',
        success: 0,
        total: 4,
        company: 0,
        jobTitle: 0,
        jobContent: 0,
        aiFiltering: 0,
        hrPosition: 0,
        jobAddress: 0,
        salaryRange: 0,
        amap: 0,
        companySizeRange: 0,
        activityFilter: 0,
        goldHunterFilter: 0,
        repeat: 4,
      },
    })

    expect(result.observed.sessionDuplicates).toEqual({
      communicated: 1,
      other: 1,
      sameCompany: 1,
      sameHr: 1,
    })
  })

  it('surfaces a warning when today deliveryLimit is already exhausted', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 80
    config.sameCompanyFilter.value = true
    config.sameHrFilter.value = true
    config.friendStatus.value = true
    config.notification.value = true
    config.useCache.value = true

    const result = buildAgentRiskSummary({
      config,
      progress: {
        state: 'paused',
        stopRequested: true,
      },
      todayData: {
        date: '2026-04-13',
        success: 80,
        total: 82,
        company: 0,
        jobTitle: 0,
        jobContent: 0,
        aiFiltering: 0,
        hrPosition: 0,
        jobAddress: 0,
        salaryRange: 0,
        amap: 0,
        companySizeRange: 0,
        activityFilter: 0,
        goldHunterFilter: 0,
        repeat: 0,
      },
    })

    expect(result.level).toBe('high')
    expect(result.delivery).toEqual(expect.objectContaining({
      limit: 80,
      reached: true,
      remainingToday: 0,
      usedToday: 80,
    }))
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'delivery-limit-reached',
        severity: 'warn',
      }),
    ])
  })

  it('surfaces a warning when failures are accumulating toward the auto-stop threshold', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 80
    config.sameCompanyFilter.value = true
    config.sameHrFilter.value = true
    config.friendStatus.value = true
    config.notification.value = true
    config.useCache.value = true

    const result = buildAgentRiskSummary({
      config,
      failureGuardrail: {
        consecutiveFailures: 2,
        limit: 3,
        totalFailures: 0,
        totalLimit: 5,
        triggered: null,
      },
      progress: {
        state: 'running',
        stopRequested: false,
      },
      todayData: {
        date: '2026-04-13',
        success: 1,
        total: 4,
        company: 0,
        jobTitle: 0,
        jobContent: 0,
        aiFiltering: 0,
        hrPosition: 0,
        jobAddress: 0,
        salaryRange: 0,
        amap: 0,
        companySizeRange: 0,
        activityFilter: 0,
        goldHunterFilter: 0,
        repeat: 0,
      },
    })

    expect(result.level).toBe('medium')
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'consecutive-failure-streak',
        severity: 'info',
      }),
    ])
  })

  it('surfaces cumulative failure-count progress before the total failure guardrail triggers', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 80
    config.sameCompanyFilter.value = true
    config.sameHrFilter.value = true
    config.friendStatus.value = true
    config.notification.value = true
    config.useCache.value = true

    const result = buildAgentRiskSummary({
      config,
      failureGuardrail: {
        consecutiveFailures: 0,
        limit: 3,
        totalFailures: 4,
        totalLimit: 5,
        triggered: null,
      },
      progress: {
        state: 'running',
        stopRequested: false,
      },
      todayData: {
        date: '2026-04-13',
        success: 1,
        total: 4,
        company: 0,
        jobTitle: 0,
        jobContent: 0,
        aiFiltering: 0,
        hrPosition: 0,
        jobAddress: 0,
        salaryRange: 0,
        amap: 0,
        companySizeRange: 0,
        activityFilter: 0,
        goldHunterFilter: 0,
        repeat: 0,
      },
    })

    expect(result.level).toBe('medium')
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'failure-count-progress',
        severity: 'info',
      }),
    ])
  })

  it('surfaces a warning when the current run is close to the per-run delivery limit', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 80
    config.sameCompanyFilter.value = true
    config.sameHrFilter.value = true
    config.friendStatus.value = true
    config.notification.value = true
    config.useCache.value = true

    const result = buildAgentRiskSummary({
      config,
      progress: {
        state: 'running',
        stopRequested: false,
      },
      run: {
        current: {
          deliveredJobIds: Array.from({ length: 18 }, (_, index) => `job-${index + 1}`),
          state: 'running',
        },
      },
      todayData: {
        date: '2026-04-13',
        success: 18,
        total: 20,
        company: 0,
        jobTitle: 0,
        jobContent: 0,
        aiFiltering: 0,
        hrPosition: 0,
        jobAddress: 0,
        salaryRange: 0,
        amap: 0,
        companySizeRange: 0,
        activityFilter: 0,
        goldHunterFilter: 0,
        repeat: 0,
      },
    })

    expect(result.level).toBe('medium')
    expect(result.delivery).toEqual(expect.objectContaining({
      remainingInRun: 2,
      runLimit: 20,
      runReached: false,
      usedInRun: 18,
    }))
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'run-delivery-limit-nearby',
        severity: 'info',
      }),
    ])
  })

  it('replays persisted auto-stop reasons from the run summary into risk warnings', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 80
    config.sameCompanyFilter.value = true
    config.sameHrFilter.value = true
    config.friendStatus.value = true
    config.notification.value = true
    config.useCache.value = true

    const result = buildAgentRiskSummary({
      config,
      progress: {
        state: 'paused',
        stopRequested: true,
      },
      run: {
        recent: {
          state: 'paused',
          lastError: {
            code: 'consecutive-failure-auto-stop',
            message: '连续失败达到 3 次，已自动暂停投递，请先检查最近错误后再决定是否 resume。',
          },
        },
      },
      todayData: {
        date: '2026-04-13',
        success: 1,
        total: 4,
        company: 0,
        jobTitle: 0,
        jobContent: 0,
        aiFiltering: 0,
        hrPosition: 0,
        jobAddress: 0,
        salaryRange: 0,
        amap: 0,
        companySizeRange: 0,
        activityFilter: 0,
        goldHunterFilter: 0,
        repeat: 0,
      },
    })

    expect(result.level).toBe('high')
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'consecutive-failure-auto-stop',
        severity: 'warn',
      }),
    ])
  })

  it('replays persisted total-failure auto-stop reasons from the run summary into risk warnings', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 80
    config.sameCompanyFilter.value = true
    config.sameHrFilter.value = true
    config.friendStatus.value = true
    config.notification.value = true
    config.useCache.value = true

    const result = buildAgentRiskSummary({
      config,
      progress: {
        state: 'paused',
        stopRequested: true,
      },
      run: {
        recent: {
          state: 'paused',
          lastError: {
            code: 'failure-count-auto-stop',
            message: '当前批次累计失败达到 5 次，已自动暂停投递，请先检查最近错误后再决定是否 resume。',
          },
        },
      },
      todayData: {
        date: '2026-04-13',
        success: 1,
        total: 4,
        company: 0,
        jobTitle: 0,
        jobContent: 0,
        aiFiltering: 0,
        hrPosition: 0,
        jobAddress: 0,
        salaryRange: 0,
        amap: 0,
        companySizeRange: 0,
        activityFilter: 0,
        goldHunterFilter: 0,
        repeat: 0,
      },
    })

    expect(result.level).toBe('high')
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'failure-count-auto-stop',
        severity: 'warn',
      }),
    ])
  })

  it('replays persisted per-run delivery guardrails from the run summary into risk warnings', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 80
    config.sameCompanyFilter.value = true
    config.sameHrFilter.value = true
    config.friendStatus.value = true
    config.notification.value = true
    config.useCache.value = true

    const result = buildAgentRiskSummary({
      config,
      progress: {
        state: 'paused',
        stopRequested: true,
      },
      run: {
        recent: {
          deliveredJobIds: Array.from({ length: 20 }, (_, index) => `job-${index + 1}`),
          lastError: {
            code: 'run-delivery-limit-reached',
            message: '本轮投递已达到上限 20，已自动暂停投递；如需继续请先 stop 当前 run，再重新 start 新的一轮。',
          },
          state: 'paused',
        },
      },
      todayData: {
        date: '2026-04-13',
        success: 20,
        total: 22,
        company: 0,
        jobTitle: 0,
        jobContent: 0,
        aiFiltering: 0,
        hrPosition: 0,
        jobAddress: 0,
        salaryRange: 0,
        amap: 0,
        companySizeRange: 0,
        activityFilter: 0,
        goldHunterFilter: 0,
        repeat: 0,
      },
    })

    expect(result.level).toBe('high')
    expect(result.delivery).toEqual(expect.objectContaining({
      remainingInRun: 0,
      runLimit: 20,
      runReached: true,
      usedInRun: 20,
    }))
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'run-delivery-limit-reached',
        severity: 'warn',
      }),
    ])
  })
})
