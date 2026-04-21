import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const collectAgentPageReadinessMock = vi.hoisted(() => vi.fn())

vi.mock('@/message/agent', () => ({
  resolveBossHelperAgentErrorMeta: vi.fn((code: string) => ({ code, message: `${code}-base` })),
}))

vi.mock('@/pages/zhipin/hooks/agentReadiness', () => ({
  collectAgentPageReadiness: collectAgentPageReadinessMock,
}))

import { resolveBossHelperAgentErrorMeta } from '@/message/agent'
import { resolveBossHelperAgentCommandFailureMeta } from '@/pages/zhipin/hooks/agentCommandMeta'
import { collectAgentPageReadiness } from '@/pages/zhipin/hooks/agentReadiness'

describe('agent command meta', () => {
  beforeEach(() => {
    collectAgentPageReadinessMock.mockReset()
    vi.mocked(resolveBossHelperAgentErrorMeta).mockClear()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns base meta when readiness preference is disabled', () => {
    const base = resolveBossHelperAgentCommandFailureMeta('job-detail-load-failed', {
      preferReadiness: false,
    })

    expect(base).toEqual({ code: 'job-detail-load-failed', message: 'job-detail-load-failed-base' })
    expect(collectAgentPageReadiness).not.toHaveBeenCalled()
  })

  it('returns base meta when error code is not readiness-driven', () => {
    const base = resolveBossHelperAgentCommandFailureMeta('unexpected', { preferReadiness: true })

    expect(base).toEqual({ code: 'unexpected', message: 'unexpected-base' })
    expect(collectAgentPageReadiness).not.toHaveBeenCalled()
  })

  it('returns base meta when readiness suggests continuing', () => {
    collectAgentPageReadinessMock.mockReturnValue({ suggestedAction: 'continue' })

    const base = resolveBossHelperAgentCommandFailureMeta('job-detail-load-failed', {
      preferReadiness: true,
    })

    expect(base).toEqual({ code: 'job-detail-load-failed', message: 'job-detail-load-failed-base' })
    expect(collectAgentPageReadiness).toHaveBeenCalledTimes(1)
  })

  it('augments base meta with retryable readiness action', () => {
    collectAgentPageReadinessMock.mockReturnValue({ suggestedAction: 'refresh-page' })

    const result = resolveBossHelperAgentCommandFailureMeta('job-detail-load-failed', {
      preferReadiness: true,
    })

    expect(result).toMatchObject({
      code: 'job-detail-load-failed',
      message: 'job-detail-load-failed-base',
      retryable: true,
      suggestedAction: 'refresh-page',
    })
    expect(collectAgentPageReadiness).toHaveBeenCalledTimes(1)
  })

  it('omits retryable flag when readiness is not retryable', () => {
    collectAgentPageReadinessMock.mockReturnValue({ suggestedAction: 'custom-action' })

    const result = resolveBossHelperAgentCommandFailureMeta('job-detail-load-failed', {
      preferReadiness: true,
    })

    expect(result).toMatchObject({
      code: 'job-detail-load-failed',
      message: 'job-detail-load-failed-base',
      suggestedAction: 'custom-action',
    })
    expect(result).not.toHaveProperty('retryable')
    expect(collectAgentPageReadiness).toHaveBeenCalledTimes(1)
  })
})
