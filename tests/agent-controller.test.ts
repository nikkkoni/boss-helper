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
    resumeBatch: vi.fn(async (payload?: unknown) => response('resume', payload)),
    startBatch: vi.fn(async (payload?: unknown) => response('start', payload)),
    stats: vi.fn(async () => response('stats')),
    stopBatch: vi.fn(async () => response('stop')),
  }

  const queries = {
    planPreview: vi.fn(async (payload?: unknown) => response('plan.preview', payload)),
    readinessGet: vi.fn(async () => response('readiness.get')),
    resumeGet: vi.fn(async () => response('resume.get')),
    navigate: vi.fn(async (payload?: unknown) => response('navigate', payload)),
    chatList: vi.fn(async (payload?: unknown) => response('chat.list', payload)),
    chatHistory: vi.fn(async (payload?: unknown) => response('chat.history', payload)),
    chatSend: vi.fn(async (payload?: unknown) => response('chat.send', payload)),
    jobsReview: vi.fn(async (payload?: unknown) => response('jobs.review', payload)),
    logsQuery: vi.fn(async (payload?: unknown) => response('logs.query', payload)),
    jobsList: vi.fn(async (payload?: unknown) => response('jobs.list', payload)),
    jobsCurrent: vi.fn(async (payload?: unknown) => response('jobs.current', payload)),
    jobsRefresh: vi.fn(async () => response('jobs.refresh')),
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

type CommandCase = {
  code: string
  command: string
  handler: ReturnType<typeof vi.fn>
  payload: unknown | undefined
}

describe('createAgentController', () => {
  it('routes every supported agent command to the injected runner and query handlers', async () => {
    const deps = createControllerDeps()
    const controller = createAgentController(deps)

    const commandCases: CommandCase[] = [
      {
        code: 'start',
        command: 'start',
        handler: deps.batchRunner.startBatch,
        payload: { confirmHighRisk: true, jobIds: ['job-1'] },
      },
      {
        code: 'pause',
        command: 'pause',
        handler: deps.batchRunner.pauseBatch,
        payload: undefined,
      },
      {
        code: 'resume',
        command: 'resume',
        handler: deps.batchRunner.resumeBatch,
        payload: { confirmHighRisk: true },
      },
      {
        code: 'resume.get',
        command: 'resume.get',
        handler: deps.queries.resumeGet,
        payload: undefined,
      },
      {
        code: 'stop',
        command: 'stop',
        handler: deps.batchRunner.stopBatch,
        payload: undefined,
      },
      {
        code: 'stats',
        command: 'stats',
        handler: deps.batchRunner.stats,
        payload: undefined,
      },
      {
        code: 'plan.preview',
        command: 'plan.preview',
        handler: deps.queries.planPreview,
        payload: { jobIds: ['job-9'] },
      },
      {
        code: 'readiness.get',
        command: 'readiness.get',
        handler: deps.queries.readinessGet,
        payload: undefined,
      },
      {
        code: 'navigate',
        command: 'navigate',
        handler: deps.queries.navigate,
        payload: { page: 2, query: 'frontend' },
      },
      {
        code: 'chat.list',
        command: 'chat.list',
        handler: deps.queries.chatList,
        payload: { limit: 10 },
      },
      {
        code: 'chat.history',
        command: 'chat.history',
        handler: deps.queries.chatHistory,
        payload: { conversationId: 'conversation-1' },
      },
      {
        code: 'chat.send',
        command: 'chat.send',
        handler: deps.queries.chatSend,
        payload: { content: 'hello', to_name: 'Boss', to_uid: 1 },
      },
      {
        code: 'logs.query',
        command: 'logs.query',
        handler: deps.queries.logsQuery,
        payload: { limit: 5, status: ['success'] },
      },
      {
        code: 'jobs.list',
        command: 'jobs.list',
        handler: deps.queries.jobsList,
        payload: { statusFilter: ['success'] },
      },
      {
        code: 'jobs.current',
        command: 'jobs.current',
        handler: deps.queries.jobsCurrent,
        payload: { includeDetail: false },
      },
      {
        code: 'jobs.refresh',
        command: 'jobs.refresh',
        handler: deps.queries.jobsRefresh,
        payload: undefined,
      },
      {
        code: 'jobs.detail',
        command: 'jobs.detail',
        handler: deps.queries.jobsDetail,
        payload: { encryptJobId: 'job-2' },
      },
      {
        code: 'jobs.review',
        command: 'jobs.review',
        handler: deps.queries.jobsReview,
        payload: { accepted: true, encryptJobId: 'job-3' },
      },
      {
        code: 'config.get',
        command: 'config.get',
        handler: deps.queries.getConfig,
        payload: undefined,
      },
      {
        code: 'config.update',
        command: 'config.update',
        handler: deps.queries.updateConfig,
        payload: { configPatch: { deliveryLimit: { value: 3 } } },
      },
    ]

    for (const commandCase of commandCases) {
      await expect(
        controller.handle({
          channel: BOSS_HELPER_AGENT_CHANNEL,
          command: commandCase.command,
          ...(commandCase.payload == null ? {} : { payload: commandCase.payload }),
        } as never),
      ).resolves.toEqual(
        expect.objectContaining({
          code: commandCase.code,
          ...(commandCase.payload == null ? {} : { data: commandCase.payload }),
        }),
      )

      if (commandCase.payload == null) {
        expect(commandCase.handler).toHaveBeenCalledTimes(1)
      } else {
        expect(commandCase.handler).toHaveBeenCalledWith(commandCase.payload)
      }
    }
  })

  it('exposes direct controller methods without hiding the original handlers', async () => {
    const deps = createControllerDeps()
    const controller = createAgentController(deps)

    await expect(controller.start({ confirmHighRisk: true, jobIds: ['job-3'] })).resolves.toEqual(
      expect.objectContaining({
        code: 'start',
        data: { confirmHighRisk: true, jobIds: ['job-3'] },
      }),
    )
    await expect(controller.resume({ confirmHighRisk: true })).resolves.toEqual(
      expect.objectContaining({
        code: 'resume',
        data: { confirmHighRisk: true },
      }),
    )
    await expect(controller.resumeGet()).resolves.toEqual(
      expect.objectContaining({ code: 'resume.get' }),
    )
    await expect(controller.readinessGet()).resolves.toEqual(
      expect.objectContaining({ code: 'readiness.get' }),
    )
    await expect(controller.planPreview({ jobIds: ['job-9'] })).resolves.toEqual(
      expect.objectContaining({
        code: 'plan.preview',
        data: { jobIds: ['job-9'] },
      }),
    )
    await expect(controller.jobsList({ statusFilter: ['success'] })).resolves.toEqual(
      expect.objectContaining({
        code: 'jobs.list',
        data: { statusFilter: ['success'] },
      }),
    )
    await expect(controller.jobsCurrent({ includeDetail: false })).resolves.toEqual(
      expect.objectContaining({
        code: 'jobs.current',
        data: { includeDetail: false },
      }),
    )
    await expect(controller.jobsRefresh()).resolves.toEqual(
      expect.objectContaining({ code: 'jobs.refresh' }),
    )

    expect(deps.batchRunner.startBatch).toHaveBeenCalledWith({ confirmHighRisk: true, jobIds: ['job-3'] })
    expect(deps.batchRunner.resumeBatch).toHaveBeenCalledWith({ confirmHighRisk: true })
    expect(deps.queries.resumeGet).toHaveBeenCalledTimes(1)
    expect(deps.queries.readinessGet).toHaveBeenCalledTimes(1)
    expect(deps.queries.planPreview).toHaveBeenCalledWith({ jobIds: ['job-9'] })
    expect(deps.queries.jobsList).toHaveBeenCalledWith({ statusFilter: ['success'] })
    expect(deps.queries.jobsCurrent).toHaveBeenCalledWith({ includeDetail: false })
    expect(deps.queries.jobsRefresh).toHaveBeenCalledTimes(1)
  })
})
