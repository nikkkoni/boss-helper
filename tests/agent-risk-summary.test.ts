import { describe, expect, it } from 'vitest'

import { buildAgentRiskSummary } from '@/pages/zhipin/shared/riskSummary'
import { defaultFormData } from '@/stores/conf/info'
import { jsonClone } from '@/utils/deepmerge'

describe('buildAgentRiskSummary', () => {
  it('reports high risk when duplicate guardrails are weak and ai reply is enabled', () => {
    const config = jsonClone(defaultFormData)
    config.deliveryLimit.value = 150
    config.sameCompanyFilter.value = false
    config.sameHrFilter.value = false
    config.friendStatus.value = false
    config.notification.value = false
    config.useCache.value = false
    config.aiReply.enable = true

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
      usedToday: 149,
    })
    expect(result.observed).toEqual({
      deliveredToday: 149,
      processedToday: 160,
      repeatFilteredToday: 6,
    })
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'high-delivery-limit', severity: 'warn' }),
        expect.objectContaining({ code: 'duplicate-guardrails-weakened', severity: 'warn' }),
        expect.objectContaining({ code: 'ai-reply-enabled', severity: 'warn' }),
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
    config.aiReply.enable = false

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
})
