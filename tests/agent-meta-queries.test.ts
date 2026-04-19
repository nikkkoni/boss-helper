// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BossHelperAgentResponseMeta } from '@/message/agent'

const metaQueryMocks = vi.hoisted(() => ({
  conf: {
    applyRuntimeConfigPatch: vi.fn(async (patch: Record<string, unknown>, _options?: { persist?: boolean }) => ({
      delay: {
        deliveryInterval: 3,
      },
      ...patch,
    })),
    getRuntimeConfigSnapshot: vi.fn(() => ({
      deliveryLimit: {
        value: 100,
      },
    })),
  },
  getUserId: vi.fn(() => 'user-1'),
  getUserResumeData: vi.fn(async () => ({ baseInfo: { nickName: 'Boss Helper' } })),
  getUserResumeString: vi.fn(async () => 'resume-text'),
  buildBossHelperNavigateUrl: vi.fn(() => 'https://www.zhipin.com/web/geek/jobs?page=2'),
}))

vi.mock('@/stores/conf', () => ({
  useConf: () => metaQueryMocks.conf,
}))

vi.mock('@/stores/user', () => ({
  useUser: () => ({
    getUserId: metaQueryMocks.getUserId,
    getUserResumeData: metaQueryMocks.getUserResumeData,
    getUserResumeString: metaQueryMocks.getUserResumeString,
  }),
}))

vi.mock('@/pages/zhipin/hooks/agentNavigate', () => ({
  buildBossHelperNavigateUrl: metaQueryMocks.buildBossHelperNavigateUrl,
}))

function createOptions(overrides: Partial<Parameters<typeof import('@/pages/zhipin/hooks/useAgentMetaQueries')['useAgentMetaQueries']>[0]> = {}) {
  return {
    currentProgressSnapshot: () => ({ current: 1 }),
    ensureStoresLoaded: vi.fn(async () => undefined),
    ensureSupportedPage: () => true,
    fail: async (code: string, message: string, meta?: BossHelperAgentResponseMeta) => ({
      code,
      message,
      ok: false,
      ...meta,
    }),
    ok: async (code: string, message: string, meta?: BossHelperAgentResponseMeta) => ({
      code,
      message,
      ok: true,
      ...meta,
    }),
    ...overrides,
  }
}

describe('useAgentMetaQueries', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/web/geek/job')
    document.title = 'Boss Jobs'
    document.body.innerHTML = `
      <div id="wrap">
        <div class="job-search-wrapper"></div>
        <div class="page-job-wrapper"></div>
      </div>
      <div id="boss-helper"></div>
      <div id="boss-helper-job"></div>
    `

    metaQueryMocks.conf.applyRuntimeConfigPatch.mockReset()
    metaQueryMocks.conf.applyRuntimeConfigPatch.mockImplementation(async (patch: Record<string, unknown>) => ({
      delay: {
        deliveryInterval: 3,
      },
      ...patch,
    }))
    metaQueryMocks.conf.getRuntimeConfigSnapshot.mockClear()
    metaQueryMocks.conf.getRuntimeConfigSnapshot.mockReturnValue({
      deliveryLimit: {
        value: 100,
      },
    })
    metaQueryMocks.getUserId.mockReset()
    metaQueryMocks.getUserId.mockReturnValue('user-1')
    metaQueryMocks.getUserResumeData.mockReset()
    metaQueryMocks.getUserResumeData.mockResolvedValue({ baseInfo: { nickName: 'Boss Helper' } })
    metaQueryMocks.getUserResumeString.mockReset()
    metaQueryMocks.getUserResumeString.mockResolvedValue('resume-text')
    metaQueryMocks.buildBossHelperNavigateUrl.mockReset()
    metaQueryMocks.buildBossHelperNavigateUrl.mockReturnValue(
      'https://www.zhipin.com/web/geek/jobs?page=2',
    )
  })

  it('returns resume snapshots on supported pages and handles failures', async () => {
    const { useAgentMetaQueries } = await import('@/pages/zhipin/hooks/useAgentMetaQueries')
    const queries = useAgentMetaQueries(createOptions())

    await expect(queries.resumeGet()).resolves.toEqual(
      expect.objectContaining({
        code: 'resume',
        ok: true,
      }),
    )
    expect(metaQueryMocks.getUserResumeData).toHaveBeenCalledTimes(1)
    expect(metaQueryMocks.getUserResumeString).toHaveBeenCalledWith({})

    metaQueryMocks.getUserResumeData.mockRejectedValueOnce(new Error('resume missing'))
    await expect(queries.resumeGet()).resolves.toEqual(
      expect.objectContaining({
        code: 'resume-load-failed',
        message: 'resume missing',
        ok: false,
        retryable: true,
        suggestedAction: 'refresh-page',
      }),
    )

    const unsupportedQueries = useAgentMetaQueries(
      createOptions({
        ensureSupportedPage: () => false,
      }),
    )
    await expect(unsupportedQueries.resumeGet()).resolves.toEqual(
      expect.objectContaining({
        code: 'unsupported-page',
        ok: false,
        retryable: true,
        suggestedAction: 'navigate',
      }),
    )
  })

  it('reports readiness snapshots and blocking signals', async () => {
    window.history.replaceState({}, '', '/web/geek/job')
    document.title = 'Boss Jobs'
    document.body.innerHTML = `
      <div id="wrap">
        <div class="job-search-wrapper"></div>
        <div class="page-job-wrapper"></div>
      </div>
      <div id="boss-helper"></div>
      <div id="boss-helper-job"></div>
    `

    const { useAgentMetaQueries } = await import('@/pages/zhipin/hooks/useAgentMetaQueries')
    const queries = useAgentMetaQueries(createOptions())

    await expect(queries.readinessGet()).resolves.toEqual(
      expect.objectContaining({
        code: 'readiness',
        ok: true,
        data: expect.objectContaining({
          ready: true,
          suggestedAction: 'continue',
          page: expect.objectContaining({
            controllable: true,
            routeKind: 'job',
            supported: true,
          }),
          extension: expect.objectContaining({
            initialized: true,
          }),
        }),
      }),
    )

    document.body.insertAdjacentHTML(
      'beforeend',
      '<button class="go-login-btn" style="display:none">隐藏登录</button><button class="go-login-btn">去登录</button>',
    )

    await expect(queries.readinessGet()).resolves.toEqual(
      expect.objectContaining({
        code: 'readiness',
        ok: true,
        data: expect.objectContaining({
          ready: false,
          suggestedAction: 'wait-login',
          account: expect.objectContaining({
            loggedIn: false,
            loginRequired: true,
          }),
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: 'login-required' }),
          ]),
        }),
      }),
    )

    document.querySelectorAll('.go-login-btn').forEach((element) => element.remove())

    document.body.insertAdjacentHTML('beforeend', '<div role="dialog">请完成安全验证</div>')

    await expect(queries.readinessGet()).resolves.toEqual(
      expect.objectContaining({
        code: 'readiness',
        ok: true,
        data: expect.objectContaining({
          ready: false,
          suggestedAction: 'stop',
          risk: expect.objectContaining({
            hasBlockingModal: true,
            hasCaptcha: true,
          }),
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: 'captcha-required' }),
            expect.objectContaining({ code: 'blocking-modal' }),
          ]),
        }),
      }),
    )
  })

  it('accepts navigate requests and reports invalid payloads', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation(
      ((..._args: Parameters<typeof window.setTimeout>) => 1) as unknown as typeof window.setTimeout,
    )
    const { useAgentMetaQueries } = await import('@/pages/zhipin/hooks/useAgentMetaQueries')
    const queries = useAgentMetaQueries(createOptions())

    await expect(queries.navigate({ page: 2 })).resolves.toEqual(
      expect.objectContaining({
        code: 'navigate-accepted',
        ok: true,
      }),
    )
    expect(metaQueryMocks.buildBossHelperNavigateUrl).toHaveBeenCalledWith(
      { page: 2 },
      window.location.href,
      window.location.origin,
    )
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 50)

    metaQueryMocks.buildBossHelperNavigateUrl.mockImplementationOnce(() => {
      throw new Error('bad target')
    })
    await expect(queries.navigate({ url: 'javascript:alert(1)' })).resolves.toEqual(
      expect.objectContaining({
        code: 'navigate-invalid',
        message: 'bad target',
        ok: false,
        retryable: false,
        suggestedAction: 'fix-input',
      }),
    )
  })

  it('returns config snapshots and validates runtime config patches', async () => {
    const { useAgentMetaQueries } = await import('@/pages/zhipin/hooks/useAgentMetaQueries')
    const queries = useAgentMetaQueries(createOptions())

    await expect(queries.getConfig()).resolves.toEqual(
      expect.objectContaining({
        code: 'config',
        ok: true,
      }),
    )

    await expect(queries.updateConfig()).resolves.toEqual(
      expect.objectContaining({
        code: 'empty-config-patch',
        ok: false,
        retryable: false,
        suggestedAction: 'fix-input',
      }),
    )

    await expect(
      queries.updateConfig({
        configPatch: {
          deliveryLimit: {
            value: 0,
          },
        } as never,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'validation-failed',
        ok: false,
        retryable: false,
        suggestedAction: 'fix-input',
      }),
    )

    await expect(
      queries.updateConfig({
        configPatch: {
          deliveryLimit: {
            value: 3,
          },
        } as never,
        persist: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'config-updated',
        message: '配置已更新并持久化',
        ok: true,
      }),
    )
    expect(metaQueryMocks.conf.applyRuntimeConfigPatch).toHaveBeenCalledWith(
      {
        deliveryLimit: {
          value: 3,
        },
      },
      { persist: true },
    )
  })

  it('rejects removed automation fields in runtime config patches', async () => {
    const { useAgentMetaQueries } = await import('@/pages/zhipin/hooks/useAgentMetaQueries')
    const queries = useAgentMetaQueries(createOptions())

    await expect(
      queries.updateConfig({
        configPatch: {
          aiReply: {
            enable: true,
            prompt: 'reply prompt',
          },
        } as never,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'validation-failed',
        ok: false,
        retryable: false,
        suggestedAction: 'fix-input',
      }),
    )

    await expect(
      queries.updateConfig({
        configPatch: {
          customGreeting: {
            enable: true,
            value: 'hello',
          },
        } as never,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'validation-failed',
        ok: false,
      }),
    )
  })
})
