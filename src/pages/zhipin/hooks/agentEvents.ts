import type {
  BossHelperAgentCurrentJob,
  BossHelperAgentEvent,
  BossHelperAgentEventType,
  BossHelperAgentProgress,
  BossHelperAgentState,
} from '@/message/agent'

const listeners = new Set<(event: BossHelperAgentEvent) => void>()

export function createBossHelperAgentEvent(args: {
  detail?: Record<string, unknown>
  job?: BossHelperAgentCurrentJob | null
  message: string
  progress?: Partial<BossHelperAgentProgress>
  state?: BossHelperAgentState
  type: BossHelperAgentEventType
}): BossHelperAgentEvent {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...args,
  }
}

export function emitBossHelperAgentEvent(event: BossHelperAgentEvent) {
  for (const listener of listeners) {
    listener(event)
  }
}

export function onBossHelperAgentEvent(listener: (event: BossHelperAgentEvent) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}