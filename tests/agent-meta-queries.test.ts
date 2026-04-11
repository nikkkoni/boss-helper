// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    fail: async (code: string, message: string) => ({ code, message, ok: false }),
    ok: async (code: string, message: string) => ({ code, message, ok: true }),
    ...overrides,
  }
}

describe('useAgentMetaQueries', () => {
  beforeEach(() => {
    metaQueryMocks.conf.applyRuntimeConfigPatch.mockReset()
    metaQueryMocks.conf.applyRuntimeConfigPatch.mockImplementation(async (patch: Record<string, unknown>) => ({
      delay: {
        deliveryInterval: 3,
      },
      ...patch,
    }))
    metaQueryMocks.conf.getRuntimeConfigSnapshot.mockClear()
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
      }),
    )

    const unsupportedQueries = useAgentMetaQueries(
      createOptions({
        ensureSupportedPage: () => false,
      }),
    )
    await expect(unsupportedQueries.resumeGet()).resolves.toEqual(
      expect.objectContaining({ code: 'unsupported-page', ok: false }),
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
})
