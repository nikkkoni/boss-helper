import { BOSS_HELPER_AGENT_EVENT_BRIDGE, BOSS_HELPER_AGENT_EVENT_FORWARD } from './constants'
import type {
  BossHelperAgentCurrentJob,
  BossHelperAgentProgress,
  BossHelperAgentState,
} from './types'

/** Agent 运行时会广播的事件类型集合，供页面 bridge 与外部订阅端共用。 */
export const bossHelperAgentEventTypes = [
  'state-changed',
  'batch-started',
  'batch-resumed',
  'batch-pausing',
  'batch-paused',
  'batch-stopped',
  'batch-completed',
  'batch-error',
  'job-started',
  'job-pending-review',
  'job-succeeded',
  'job-filtered',
  'job-failed',
  'rate-limited',
  'limit-reached',
] as const

export type BossHelperAgentEventType = (typeof bossHelperAgentEventTypes)[number]

export interface BossHelperAgentEvent {
  createdAt: string
  detail?: Record<string, unknown>
  id: string
  job?: BossHelperAgentCurrentJob | null
  message: string
  progress?: Partial<BossHelperAgentProgress>
  state?: BossHelperAgentState
  type: BossHelperAgentEventType
}

export interface BossHelperAgentEventBridgeMessage {
  payload: BossHelperAgentEvent
  type: typeof BOSS_HELPER_AGENT_EVENT_BRIDGE
}

export interface BossHelperAgentEventForwardMessage {
  payload: BossHelperAgentEvent
  type: typeof BOSS_HELPER_AGENT_EVENT_FORWARD
}
