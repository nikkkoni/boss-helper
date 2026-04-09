import { useCommon } from '@/composables/useCommon'
import type { BossHelperAgentState } from '@/message/agent'

import { createBossHelperAgentEvent, emitBossHelperAgentEvent } from './agentEvents'

interface UseAgentBatchEventsOptions {
  common: ReturnType<typeof useCommon>
  currentProgressSnapshot: () => Record<string, unknown>
}

/**
 * 维护批处理运行态与 agent 事件广播之间的映射。
 *
 * 所有外部观察者看到的 `batch-started`、`batch-paused`、`state-changed` 等事件
 * 都从这里统一发出，避免 UI 文案和 agent 侧状态流出现分叉。
 */
export function useAgentBatchEvents(options: UseAgentBatchEventsOptions) {
  function emitEvent(
    type: Parameters<typeof createBossHelperAgentEvent>[0]['type'],
    state: BossHelperAgentState,
    message: string,
    detail?: Record<string, unknown>,
  ) {
    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type,
        state,
        message,
        progress: options.currentProgressSnapshot(),
        detail,
      }),
    )
  }

  function setDeliverState(state: BossHelperAgentState, message: string) {
    const previousState = options.common.deliverState
    const previousMessage = options.common.deliverStatusMessage
    options.common.deliverState = state
    options.common.deliverStatusMessage = message

    if (previousState !== state || previousMessage !== message) {
      emitEvent('state-changed', state, message)
    }
  }

  function emitBatchStarted(mode: 'start' | 'resume', targetCount: number) {
    emitEvent(
      mode === 'resume' ? 'batch-resumed' : 'batch-started',
      'running',
      mode === 'resume'
        ? '投递已恢复'
        : targetCount > 0
          ? `定向投递任务已启动，目标 ${targetCount} 个岗位`
          : '投递任务已启动',
      { mode },
    )
  }

  function emitBatchError(message: string) {
    emitEvent('batch-error', 'error', message)
  }

  function emitBatchStopped() {
    emitEvent('batch-stopped', 'idle', '投递任务已停止', {
      source: 'stop-command',
    })
  }

  function emitBatchPaused(message: string) {
    emitEvent('batch-paused', 'paused', message)
  }

  function emitBatchCompleted(message: string) {
    emitEvent('batch-completed', 'completed', message)
  }

  function emitBatchPausing(message: string, source?: 'stop-command') {
    emitEvent('batch-pausing', 'pausing', message, source ? { source } : undefined)
  }

  return {
    setDeliverState,
    emitBatchStarted,
    emitBatchError,
    emitBatchStopped,
    emitBatchPaused,
    emitBatchCompleted,
    emitBatchPausing,
  }
}
