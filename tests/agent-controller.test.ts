import { describe, expect, it, vi } from 'vitest'

import { BOSS_HELPER_AGENT_CHANNEL } from '@/message/agent'
import { createAgentController } from '@/pages/zhipin/hooks/agentController'

function createControllerDeps() {
  const response = (code: string, data?: unknown) => ({
    code,
    data,
    message: code,
    ok: true,
  })

  const batchRunner = {
    pauseBatch: vi.fn(async () => response('pause')),
    resumeBatch: vi.fn(async () => response('resume')),
    startBatch: vi.fn(async (payload?: unknown) => response('start', payload)),
    stats: vi.fn(async () => response('stats')),
    stopBatch: vi.fn(async () => response('stop')),
  }

  const queries = {
    resumeGet: vi.fn(async () => response('resume.get')),
    navigate: vi.fn(async (payload?: unknown) => response('navigate', payload)),
    chatList: vi.fn(async (payload?: unknown) => response('chat.list', payload)),
    chatHistory: vi.fn(async (payload?: unknown) => response('chat.history', payload)),
    chatSend: vi.fn(async (payload?: unknown) => response('chat.send', payload)),
    jobsReview: vi.fn(async (payload?: unknown) => response('jobs.review', payload)),
    logsQuery: vi.fn(async (payload?: unknown) => response('logs.query', payload)),
    jobsList: vi.fn(async (payload?: unknown) => response('jobs.list', payload)),
    jobsDetail: vi.fn(async (payload?: unknown) => response('jobs.detail', payload)),
    getConfig: vi.fn(async () => response('config.get')),
    updateConfig: vi.fn(async (payload?: unknown) => response('config.update', payload)),
  }

  return {
    batchRunner,
    queries,
  } as Parameters<typeof createAgentController>[0] & {
    batchRunner: typeof batchRunner
    queries: typeof queries
  }
}

describe('createAgentController', () => {
  it('routes agent commands to the injected runner and query handlers', async () => {
    const deps = createControllerDeps()
    const controller = createAgentController(deps)

    const startPayload = { jobIds: ['job-1'] }
    const historyPayload = { conversationId: 'conversation-1' }
    const detailPayload = { encryptJobId: 'job-2' }
    const configPayload = { configPatch: { deliveryLimit: { value: 3 } } }

    await expect(
      controller.handle({
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'start',
        payload: startPayload,
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'start', data: startPayload }))
    await expect(
      controller.handle({ channel: BOSS_HELPER_AGENT_CHANNEL, command: 'pause' }),
    ).resolves.toEqual(expect.objectContaining({ code: 'pause' }))
    await expect(
      controller.handle({
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'chat.history',
        payload: historyPayload,
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'chat.history', data: historyPayload }))
    await expect(
      controller.handle({
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'jobs.detail',
        payload: detailPayload,
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'jobs.detail', data: detailPayload }))
    await expect(
      controller.handle({
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'config.update',
        payload: configPayload,
      }),
    ).resolves.toEqual(expect.objectContaining({ code: 'config.update', data: configPayload }))

    expect(deps.batchRunner.startBatch).toHaveBeenCalledWith(startPayload)
    expect(deps.batchRunner.pauseBatch).toHaveBeenCalledTimes(1)
    expect(deps.queries.chatHistory).toHaveBeenCalledWith(historyPayload)
    expect(deps.queries.jobsDetail).toHaveBeenCalledWith(detailPayload)
    expect(deps.queries.updateConfig).toHaveBeenCalledWith(configPayload)
  })

  it('exposes direct controller methods without hiding the original handlers', async () => {
    const deps = createControllerDeps()
    const controller = createAgentController(deps)

    await expect(controller.start({ jobIds: ['job-3'] })).resolves.toEqual(
      expect.objectContaining({
        code: 'start',
        data: { jobIds: ['job-3'] },
      }),
    )
    await expect(controller.resumeGet()).resolves.toEqual(
      expect.objectContaining({ code: 'resume.get' }),
    )
    await expect(controller.jobsList({ statusFilter: ['success'] })).resolves.toEqual(
      expect.objectContaining({
        code: 'jobs.list',
        data: { statusFilter: ['success'] },
      }),
    )

    expect(deps.batchRunner.startBatch).toHaveBeenCalledWith({ jobIds: ['job-3'] })
    expect(deps.queries.resumeGet).toHaveBeenCalledTimes(1)
    expect(deps.queries.jobsList).toHaveBeenCalledWith({ statusFilter: ['success'] })
  })
})
