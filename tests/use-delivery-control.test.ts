// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BOSS_HELPER_AGENT_BRIDGE_REQUEST,
  BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
  BOSS_HELPER_AGENT_CHANNEL,
  BOSS_HELPER_AGENT_EVENT_BRIDGE,
  type BossHelperAgentResponseMeta,
} from '@/message/agent'

type DeliveryControlRunnerOptions = {
  ensureStoresLoaded: () => Promise<void>
  ensureSupportedPage: () => boolean
}

type DeliveryControlQueryOptions = {
  currentProgressSnapshot: () => Record<string, unknown>
  ensureStoresLoaded: () => Promise<void>
  ensureSupportedPage: () => boolean
  fail: (code: string, message: string, meta?: BossHelperAgentResponseMeta) => Promise<unknown>
  ok: (code: string, message: string, meta?: BossHelperAgentResponseMeta) => Promise<unknown>
}

const deliveryControlMocks = vi.hoisted(() => ({
  lastQueryOptions: undefined as DeliveryControlQueryOptions | undefined,
  lastRunnerOptions: undefined as DeliveryControlRunnerOptions | undefined,
  isSupportedSiteUrl: vi.fn(() => true),
  deepmerge: vi.fn((target: Record<string, any>, source: Record<string, any>) => {
    const output = target
    const mergeInto = (left: Record<string, any>, right: Record<string, any>) => {
      for (const [key, value] of Object.entries(right)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          left[key] ??= {}
          mergeInto(left[key], value)
        } else {
          left[key] = value
        }
      }
      return left
    }
    return mergeInto(output, source)
  }),
  jsonClone: vi.fn((value: unknown) => structuredClone(value)),
  createBossHelperAgentResponse: vi.fn((ok: boolean, code: string, message: string, data?: unknown, meta?: Record<string, unknown>) => ({
    ok,
    code,
    message,
    data,
    ...meta,
  })),
  isBossHelperAgentBridgeRequest: vi.fn((value: any) => {
    return value?.type === BOSS_HELPER_AGENT_BRIDGE_REQUEST && value?.payload?.channel === BOSS_HELPER_AGENT_CHANNEL
  }),
  isBossHelperSameOriginWindowMessage: vi.fn(() => true),
  postBossHelperWindowMessage: vi.fn(),
  confStore: {
    formData: {
      deliveryLimit: {
        value: 120,
      },
      friendStatus: {
        value: true,
      },
      notification: {
        value: true,
      },
      sameCompanyFilter: {
        value: true,
      },
      sameHrFilter: {
        value: true,
      },
      useCache: {
        value: true,
      },
      aiFiltering: {
        enable: false,
        externalMode: false,
      },
    },
    isLoaded: false,
    confInit: vi.fn(async () => {
      deliveryControlMocks.confStore.isLoaded = true
    }),
  },
  agentRuntime: {
    ensureRunSummaryLoaded: vi.fn(async () => undefined),
    getFailureGuardrailSnapshot: vi.fn(() => ({
      consecutiveFailures: 0,
      limit: 3,
      totalFailures: 0,
      totalLimit: 5,
      triggered: null,
    })),
    recordEvent: vi.fn(async () => undefined),
  },
  useLog: vi.fn(),
  runner: {
    currentProgressSnapshot: vi.fn(() => ({ state: 'idle' })),
    pauseBatch: vi.fn(async () => ({ code: 'pause' })),
    resetFilter: vi.fn(),
    resumeBatch: vi.fn(async () => ({ code: 'resume' })),
    startBatch: vi.fn(async () => ({ code: 'start' })),
    stats: vi.fn(async () => ({ code: 'stats' })),
    stopBatch: vi.fn(async () => ({ code: 'stop' })),
    getStatsData: vi.fn(async () => ({
      historyData: [],
      progress: {
        activeTargetJobIds: [],
        current: 0,
        currentJob: null,
        locked: false,
        message: '未开始',
        page: 1,
        pageSize: 15,
        remainingTargetJobIds: [],
        state: 'idle',
        stopRequested: false,
        total: 0,
      },
      risk: {
        automation: {
          aiFilteringEnabled: false,
          aiFilteringExternal: false,
        },
        delivery: {
          limit: 120,
          reached: false,
          remainingToday: 120,
          remainingInRun: 20,
          runLimit: 20,
          runReached: false,
          usedInRun: 0,
          usedToday: 0,
        },
        guardrails: {
          friendStatus: true,
          notification: true,
          sameCompanyFilter: true,
          sameHrFilter: true,
          useCache: true,
        },
        level: 'low',
        observed: {
          deliveredToday: 0,
          processedToday: 0,
          repeatFilteredToday: 0,
          sessionDuplicates: {
            communicated: 0,
            other: 0,
            sameCompany: 0,
            sameHr: 0,
          },
        },
        runtime: {
          state: 'idle',
          stopRequested: false,
        },
        warnings: [],
      },
      run: {
        current: null,
        recent: null,
      },
      todayData: {
        date: '2026-04-13',
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
      },
    })),
  },
  useAgentBatchRunner: vi.fn((options: DeliveryControlRunnerOptions) => {
    deliveryControlMocks.lastRunnerOptions = options
    return deliveryControlMocks.runner
  }),
  queries: {
    planPreview: vi.fn(async (payload?: unknown) => ({ code: 'plan.preview', payload })),
    readinessGet: vi.fn(async () => ({ code: 'readiness.get' })),
    resumeGet: vi.fn(async () => ({ code: 'resume.get' })),
    navigate: vi.fn(async (payload?: unknown) => ({ code: 'navigate', payload })),
    jobsReview: vi.fn(async (payload?: unknown) => ({ code: 'jobs.review', payload })),
    logsQuery: vi.fn(async (payload?: unknown) => ({ code: 'logs.query', payload })),
    jobsList: vi.fn(async (payload?: unknown) => ({ code: 'jobs.list', payload })),
    jobsCurrent: vi.fn(async (payload?: unknown) => ({ code: 'jobs.current', payload })),
    jobsRefresh: vi.fn(async () => ({ code: 'jobs.refresh' })),
    jobsDetail: vi.fn(async (payload?: unknown) => ({ code: 'jobs.detail', payload })),
    getConfig: vi.fn(async () => ({ code: 'config.get' })),
    updateConfig: vi.fn(async (payload?: unknown) => ({ code: 'config.update', payload })),
  },
  useAgentQueries: vi.fn((options: DeliveryControlQueryOptions) => {
    deliveryControlMocks.lastQueryOptions = options
    return deliveryControlMocks.queries
  }),
  onBossHelperAgentEvent: vi.fn(),
}))

vi.mock('@/site-adapters', () => ({
  isSupportedSiteUrl: deliveryControlMocks.isSupportedSiteUrl,
}))

vi.mock('@/utils/deepmerge', () => ({
  default: deliveryControlMocks.deepmerge,
  jsonClone: deliveryControlMocks.jsonClone,
}))

vi.mock('@/message/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/message/agent')>()
  return {
    ...actual,
    createBossHelperAgentResponse: deliveryControlMocks.createBossHelperAgentResponse,
    isBossHelperAgentBridgeRequest: deliveryControlMocks.isBossHelperAgentBridgeRequest,
  }
})

vi.mock('@/message/window', () => ({
  isBossHelperSameOriginWindowMessage: deliveryControlMocks.isBossHelperSameOriginWindowMessage,
  postBossHelperWindowMessage: deliveryControlMocks.postBossHelperWindowMessage,
}))

vi.mock('@/stores/conf', () => ({
  useConf: () => deliveryControlMocks.confStore,
}))

vi.mock('@/stores/agent', () => ({
  useAgentRuntime: () => deliveryControlMocks.agentRuntime,
}))

vi.mock('@/stores/log', () => ({
  useLog: deliveryControlMocks.useLog,
}))

vi.mock('@/pages/zhipin/hooks/useAgentBatchRunner', () => ({
  useAgentBatchRunner: deliveryControlMocks.useAgentBatchRunner,
}))

vi.mock('@/pages/zhipin/hooks/useAgentQueries', () => ({
  useAgentQueries: deliveryControlMocks.useAgentQueries,
}))

vi.mock('@/pages/zhipin/hooks/agentEvents', () => ({
  onBossHelperAgentEvent: deliveryControlMocks.onBossHelperAgentEvent,
}))

async function loadDeliveryControl() {
  return import('@/pages/zhipin/hooks/useDeliveryControl')
}

async function waitForAssert(assertion: () => void, attempts = 20) {
  let lastError: unknown
  for (let index = 0; index < attempts; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await Promise.resolve()
    }
  }
  throw lastError
}

function createSameOriginEvent(data: unknown) {
  const event = new MessageEvent('message', {
    data,
    origin: window.location.origin,
  })
  Object.defineProperty(event, 'source', {
    configurable: true,
    value: window,
  })
  return event
}

describe('useDeliveryControl', () => {
  beforeEach(() => {
    vi.resetModules()
    deliveryControlMocks.lastQueryOptions = undefined
    deliveryControlMocks.lastRunnerOptions = undefined
    deliveryControlMocks.isSupportedSiteUrl.mockReset()
    deliveryControlMocks.isSupportedSiteUrl.mockReturnValue(true)
    deliveryControlMocks.jsonClone.mockClear()
    deliveryControlMocks.deepmerge.mockClear()
    deliveryControlMocks.createBossHelperAgentResponse.mockClear()
    deliveryControlMocks.isBossHelperAgentBridgeRequest.mockClear()
    deliveryControlMocks.isBossHelperSameOriginWindowMessage.mockReset()
    deliveryControlMocks.isBossHelperSameOriginWindowMessage.mockReturnValue(true)
    deliveryControlMocks.postBossHelperWindowMessage.mockClear()
    deliveryControlMocks.confStore.isLoaded = false
    deliveryControlMocks.confStore.confInit.mockClear()
    deliveryControlMocks.agentRuntime.ensureRunSummaryLoaded.mockClear()
    deliveryControlMocks.agentRuntime.getFailureGuardrailSnapshot.mockClear()
    deliveryControlMocks.agentRuntime.recordEvent.mockClear()
    deliveryControlMocks.useLog.mockClear()
    deliveryControlMocks.useAgentBatchRunner.mockClear()
    deliveryControlMocks.useAgentQueries.mockClear()
    deliveryControlMocks.onBossHelperAgentEvent.mockReset()

    deliveryControlMocks.runner.currentProgressSnapshot.mockReset()
    deliveryControlMocks.runner.pauseBatch.mockReset()
    deliveryControlMocks.runner.resetFilter.mockReset()
    deliveryControlMocks.runner.resumeBatch.mockReset()
    deliveryControlMocks.runner.startBatch.mockReset()
    deliveryControlMocks.runner.stats.mockReset()
    deliveryControlMocks.runner.stopBatch.mockReset()
    deliveryControlMocks.runner.getStatsData.mockReset()
    deliveryControlMocks.runner.currentProgressSnapshot.mockReturnValue({ state: 'idle' })
    deliveryControlMocks.runner.pauseBatch.mockResolvedValue({ code: 'pause' })
    deliveryControlMocks.runner.resumeBatch.mockResolvedValue({ code: 'resume' })
    deliveryControlMocks.runner.startBatch.mockResolvedValue({ code: 'start' })
    deliveryControlMocks.runner.stats.mockResolvedValue({ code: 'stats' })
    deliveryControlMocks.runner.stopBatch.mockResolvedValue({ code: 'stop' })
    deliveryControlMocks.runner.getStatsData.mockResolvedValue({
      historyData: [],
      progress: {
        activeTargetJobIds: [],
        current: 0,
        currentJob: null,
        locked: false,
        message: '未开始',
        page: 1,
        pageSize: 15,
        remainingTargetJobIds: [],
        state: 'idle',
        stopRequested: false,
        total: 0,
      },
      risk: {
        automation: {
          aiFilteringEnabled: false,
          aiFilteringExternal: false,
        },
        delivery: {
          limit: 120,
          reached: false,
          remainingToday: 120,
          remainingInRun: 20,
          runLimit: 20,
          runReached: false,
          usedInRun: 0,
          usedToday: 0,
        },
        guardrails: {
          friendStatus: true,
          notification: true,
          sameCompanyFilter: true,
          sameHrFilter: true,
          useCache: true,
        },
        level: 'low',
        observed: {
          deliveredToday: 0,
          processedToday: 0,
          repeatFilteredToday: 0,
          sessionDuplicates: {
            communicated: 0,
            other: 0,
            sameCompany: 0,
            sameHr: 0,
          },
        },
        runtime: {
          state: 'idle',
          stopRequested: false,
        },
        warnings: [],
      },
      run: {
        current: null,
        recent: null,
      },
      todayData: {
        date: '2026-04-13',
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
      },
    })

    for (const fn of Object.values(deliveryControlMocks.queries)) {
      fn.mockClear()
    }
    deliveryControlMocks.queries.resumeGet.mockResolvedValue({ code: 'resume.get' })
    deliveryControlMocks.queries.planPreview.mockImplementation(async (payload?: unknown) => ({ code: 'plan.preview', payload }))
    deliveryControlMocks.queries.readinessGet.mockResolvedValue({ code: 'readiness.get' })
    deliveryControlMocks.queries.navigate.mockImplementation(async (payload?: unknown) => ({ code: 'navigate', payload }))
    deliveryControlMocks.queries.jobsReview.mockImplementation(async (payload?: unknown) => ({ code: 'jobs.review', payload }))
    deliveryControlMocks.queries.logsQuery.mockImplementation(async (payload?: unknown) => ({ code: 'logs.query', payload }))
    deliveryControlMocks.queries.jobsList.mockImplementation(async (payload?: unknown) => ({ code: 'jobs.list', payload }))
    deliveryControlMocks.queries.jobsCurrent.mockImplementation(async (payload?: unknown) => ({ code: 'jobs.current', payload }))
    deliveryControlMocks.queries.jobsRefresh.mockResolvedValue({ code: 'jobs.refresh' })
    deliveryControlMocks.queries.jobsDetail.mockImplementation(async (payload?: unknown) => ({ code: 'jobs.detail', payload }))
    deliveryControlMocks.queries.getConfig.mockResolvedValue({ code: 'config.get' })
    deliveryControlMocks.queries.updateConfig.mockImplementation(async (payload?: unknown) => ({ code: 'config.update', payload }))

    window.history.replaceState({}, '', '/web/geek/job')
  })

  it('routes representative commands through controller.handle', async () => {
    const { useDeliveryControl } = await loadDeliveryControl()
    const control = useDeliveryControl()

    const startPayload = { confirmHighRisk: true, jobIds: ['job-1'] }
    const resumePayload = { confirmHighRisk: true }
    const planPayload = { jobIds: ['job-9'] }
    const currentPayload = { includeDetail: false }
    const detailPayload = { encryptJobId: 'job-2' }
    const configPayload = { configPatch: { deliveryLimit: { value: 3 } } }

    await expect(control.controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'start', payload: startPayload })).resolves.toEqual({ code: 'start' })
    await expect(control.controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'pause' })).resolves.toEqual({ code: 'pause' })
    await expect(control.controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'resume', payload: resumePayload })).resolves.toEqual({ code: 'resume' })
    await expect(control.controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'stats' })).resolves.toEqual({ code: 'stats' })
    await expect(control.controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'plan.preview', payload: planPayload })).resolves.toEqual({ code: 'plan.preview', payload: planPayload })
    await expect(control.controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'readiness.get' })).resolves.toEqual({ code: 'readiness.get' })
    await expect(control.controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'jobs.current', payload: currentPayload })).resolves.toEqual({ code: 'jobs.current', payload: currentPayload })
    await expect(control.controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'jobs.refresh' })).resolves.toEqual({ code: 'jobs.refresh' })
    await expect(control.controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'jobs.detail', payload: detailPayload })).resolves.toEqual({ code: 'jobs.detail', payload: detailPayload })
    await expect(control.controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'config.update', payload: configPayload })).resolves.toEqual({ code: 'config.update', payload: configPayload })

    expect(deliveryControlMocks.runner.startBatch).toHaveBeenCalledWith(startPayload)
    expect(deliveryControlMocks.runner.pauseBatch).toHaveBeenCalledTimes(1)
    expect(deliveryControlMocks.runner.resumeBatch).toHaveBeenCalledWith(resumePayload)
    expect(deliveryControlMocks.runner.stats).toHaveBeenCalledTimes(1)
    expect(deliveryControlMocks.queries.planPreview).toHaveBeenCalledWith(planPayload)
    expect(deliveryControlMocks.queries.readinessGet).toHaveBeenCalledTimes(1)
    expect(deliveryControlMocks.queries.jobsCurrent).toHaveBeenCalledWith(currentPayload)
    expect(deliveryControlMocks.queries.jobsRefresh).toHaveBeenCalledTimes(1)
    expect(deliveryControlMocks.queries.jobsDetail).toHaveBeenCalledWith(detailPayload)
    expect(deliveryControlMocks.queries.updateConfig).toHaveBeenCalledWith(configPayload)
  })

  it('wires supported-page checks into runner and query options', async () => {
    const { useDeliveryControl } = await loadDeliveryControl()
    useDeliveryControl()

    const runnerOptions = deliveryControlMocks.lastRunnerOptions
    const queryOptions = deliveryControlMocks.lastQueryOptions

    deliveryControlMocks.isSupportedSiteUrl.mockReturnValue(false)
    expect(runnerOptions).toBeDefined()
    expect(queryOptions).toBeDefined()
    expect(runnerOptions!.ensureSupportedPage()).toBe(false)
    expect(queryOptions!.ensureSupportedPage()).toBe(false)
  })

  it('preserves structured error meta in query helper wrappers', async () => {
    const { useDeliveryControl } = await loadDeliveryControl()
    useDeliveryControl()

    const queryOptions = deliveryControlMocks.lastQueryOptions
    expect(queryOptions).toBeDefined()

    await expect(
      queryOptions!.fail('validation-failed', '配置校验失败', {
        retryable: false,
        suggestedAction: 'fix-input',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'validation-failed',
        message: '配置校验失败',
        ok: false,
        retryable: false,
        suggestedAction: 'fix-input',
      }),
    )
    expect(deliveryControlMocks.createBossHelperAgentResponse).toHaveBeenCalledWith(
      false,
      'validation-failed',
      '配置校验失败',
      expect.objectContaining({
        progress: expect.objectContaining({ state: 'idle' }),
      }),
      { retryable: false, suggestedAction: 'fix-input' },
    )
  })

  it('requires explicit confirmation for external start and resume commands', async () => {
    const { useDeliveryControl } = await loadDeliveryControl()
    const control = useDeliveryControl()

    await expect(
      control.controller.handle({
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'start',
        payload: {
          configPatch: {
            customGreeting: {
              enable: true,
              value: 'hello',
            },
          },
          jobIds: ['job-1'],
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'validation-failed',
        ok: false,
        retryable: false,
        suggestedAction: 'fix-input',
      }),
    )
    expect(deliveryControlMocks.runner.startBatch).not.toHaveBeenCalled()

    await expect(
      control.controller.handle({
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'resume',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'high-risk-action-confirmation-required',
        data: expect.objectContaining({
          preflight: expect.objectContaining({
            command: 'resume',
            configPatchKeys: [],
            requiresConfirmHighRisk: true,
          }),
        }),
        ok: false,
        retryable: false,
        suggestedAction: 'fix-input',
      }),
    )
    expect(deliveryControlMocks.runner.resumeBatch).not.toHaveBeenCalled()
  })

  it('forwards agent events and shapes window bridge responses', async () => {
    let stopEvents = 0
    deliveryControlMocks.onBossHelperAgentEvent.mockImplementation((listener: (payload: unknown) => void) => {
      listener({ type: 'job-started', message: 'event payload' })
      return () => {
        stopEvents += 1
      }
    })

    const { useDeliveryControl } = await loadDeliveryControl()
    const unregister = useDeliveryControl().registerWindowAgentBridge()

    expect(deliveryControlMocks.postBossHelperWindowMessage).toHaveBeenCalledWith(window, {
      type: BOSS_HELPER_AGENT_EVENT_BRIDGE,
      payload: { type: 'job-started', message: 'event payload' },
    })
    expect(deliveryControlMocks.agentRuntime.recordEvent).toHaveBeenCalledWith(
      { type: 'job-started', message: 'event payload' },
      { state: 'idle' },
    )

    window.dispatchEvent(
      createSameOriginEvent({
        type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
        requestId: 'req-1',
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
      }),
    )
    expect(deliveryControlMocks.runner.stats).toHaveBeenCalledTimes(1)
    await waitForAssert(() => {
      expect(
        deliveryControlMocks.postBossHelperWindowMessage.mock.calls.some(
          ([, payload]) =>
            (payload as Record<string, unknown>).type === BOSS_HELPER_AGENT_BRIDGE_RESPONSE
            && (payload as Record<string, unknown>).requestId === 'req-1'
            && (payload as Record<string, any>).payload?.code === 'stats',
        ),
      ).toBe(true)
    })

    unregister()
    expect(stopEvents).toBe(1)
  })

  it('returns controller errors through the window bridge and unregisters listeners', async () => {
    deliveryControlMocks.runner.stats.mockRejectedValue(new Error('stats exploded'))
    deliveryControlMocks.onBossHelperAgentEvent.mockImplementation(() => vi.fn())

    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { useDeliveryControl } = await loadDeliveryControl()
    const unregister = useDeliveryControl().registerWindowAgentBridge()

    window.dispatchEvent(
      createSameOriginEvent({
        type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
        requestId: 'req-2',
        payload: {
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: 'stats',
        },
      }),
    )
    await waitForAssert(() => {
      expect(deliveryControlMocks.createBossHelperAgentResponse).toHaveBeenCalledWith(
        false,
        'controller-error',
        'stats exploded',
      )
    })
    await waitForAssert(() => {
      expect(
        deliveryControlMocks.postBossHelperWindowMessage.mock.calls.some(
          ([, payload]) =>
            (payload as Record<string, unknown>).type === BOSS_HELPER_AGENT_BRIDGE_RESPONSE
            && (payload as Record<string, unknown>).requestId === 'req-2'
            && (payload as Record<string, any>).payload?.code === 'controller-error'
            && (payload as Record<string, any>).payload?.message === 'stats exploded',
        ),
      ).toBe(true)
    })

    unregister()

    expect(addSpy).toHaveBeenCalledWith('message', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function))
  })
})
