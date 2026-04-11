import { beforeEach, describe, expect, it, vi } from 'vitest'

const batchPayloadMocks = vi.hoisted(() => ({
  jobList: {
    list: [{ encryptJobId: 'job-1' }, { encryptJobId: 'job-2' }],
  },
  resetJobStatuses: vi.fn(),
}))

vi.mock('@/stores/jobs', () => ({
  jobList: batchPayloadMocks.jobList,
}))

vi.mock('@/pages/zhipin/shared/jobMapping', () => ({
  resetJobStatuses: batchPayloadMocks.resetJobStatuses,
}))

describe('applyAgentBatchStartPayload', () => {
  beforeEach(() => {
    batchPayloadMocks.resetJobStatuses.mockReset()
  })

  it('normalizes target job ids and applies runtime config patches', async () => {
    const { applyAgentBatchStartPayload } = await import('@/pages/zhipin/services/agentBatchPayload')
    const agentRuntime = {
      setTargetJobIds: vi.fn(),
    }
    const conf = {
      applyRuntimeConfigPatch: vi.fn(async () => undefined),
    }

    await applyAgentBatchStartPayload({
      agentRuntime: agentRuntime as never,
      conf: conf as never,
      payload: {
        configPatch: {
          deliveryLimit: {
            value: 3,
          },
        } as never,
        jobIds: [' job-1 ', '', 'job-1', 'job-2 '],
        persistConfig: true,
      },
    })

    expect(agentRuntime.setTargetJobIds).toHaveBeenCalledWith(['job-1', 'job-2'])
    expect(conf.applyRuntimeConfigPatch).toHaveBeenCalledWith(
      {
        deliveryLimit: {
          value: 3,
        },
      },
      { persist: true },
    )
    expect(batchPayloadMocks.resetJobStatuses).not.toHaveBeenCalled()
  })

  it('resets filtered job statuses only when no explicit target ids remain', async () => {
    const { applyAgentBatchStartPayload } = await import('@/pages/zhipin/services/agentBatchPayload')

    await applyAgentBatchStartPayload({
      agentRuntime: {
        setTargetJobIds: vi.fn(),
      } as never,
      conf: {
        applyRuntimeConfigPatch: vi.fn(async () => undefined),
      } as never,
      payload: {
        jobIds: ['   '],
        resetFiltered: true,
      },
    })

    expect(batchPayloadMocks.resetJobStatuses).toHaveBeenCalledWith(
      batchPayloadMocks.jobList.list,
      expect.any(Function),
    )
  })
})
