import { beforeEach, describe, expect, it, vi } from 'vitest'

const batchEventMocks = vi.hoisted(() => ({
  createBossHelperAgentEvent: vi.fn((payload) => payload),
  emitBossHelperAgentEvent: vi.fn(),
}))

vi.mock('@/pages/zhipin/hooks/agentEvents', () => ({
  createBossHelperAgentEvent: batchEventMocks.createBossHelperAgentEvent,
  emitBossHelperAgentEvent: batchEventMocks.emitBossHelperAgentEvent,
}))

describe('useAgentBatchEvents', () => {
  beforeEach(() => {
    batchEventMocks.createBossHelperAgentEvent.mockClear()
    batchEventMocks.emitBossHelperAgentEvent.mockReset()
  })

  it('updates deliver state only when it changes and emits lifecycle events', async () => {
    const { useAgentBatchEvents } = await import('@/pages/zhipin/hooks/useAgentBatchEvents')
    const common = {
      deliverState: 'idle',
      deliverStatusMessage: '未开始',
    }
    const events = useAgentBatchEvents({
      common: common as never,
      currentProgressSnapshot: () => ({ current: 1, total: 2 }),
    })

    events.setDeliverState('running', '投递进行中')
    events.setDeliverState('running', '投递进行中')
    events.emitBatchStarted('start', 0)
    events.emitBatchStarted('resume', 2)
    events.emitBatchError('boom')
    events.emitBatchStopped()
    events.emitBatchPaused('paused')
    events.emitBatchCompleted('done')
    events.emitBatchPausing('stopping', 'stop-command')

    expect(common).toEqual({
      deliverState: 'running',
      deliverStatusMessage: '投递进行中',
    })
    expect(batchEventMocks.emitBossHelperAgentEvent).toHaveBeenCalledTimes(8)
    expect(batchEventMocks.emitBossHelperAgentEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: '投递进行中',
        progress: { current: 1, total: 2 },
        state: 'running',
        type: 'state-changed',
      }),
    )
    expect(batchEventMocks.emitBossHelperAgentEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        detail: { mode: 'start' },
        message: '投递任务已启动',
        type: 'batch-started',
      }),
    )
    expect(batchEventMocks.emitBossHelperAgentEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        detail: { mode: 'resume' },
        message: '投递已恢复',
        type: 'batch-resumed',
      }),
    )
    expect(batchEventMocks.emitBossHelperAgentEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        detail: { source: 'stop-command' },
        message: 'stopping',
        state: 'pausing',
        type: 'batch-pausing',
      }),
    )
  })
})
