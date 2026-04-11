import { AGENT_PROTOCOL_VERSION } from '../../../shared/agentProtocol.js'

export const BOSS_HELPER_AGENT_CHANNEL = '__boss_helper_agent__'
export const BOSS_HELPER_AGENT_BRIDGE_REQUEST = '__boss_helper_agent_bridge_request__'
export const BOSS_HELPER_AGENT_BRIDGE_RESPONSE = '__boss_helper_agent_bridge_response__'
export const BOSS_HELPER_AGENT_EVENT_BRIDGE = '__boss_helper_agent_event_bridge__'
export const BOSS_HELPER_AGENT_EVENT_FORWARD = '__boss_helper_agent_event_forward__'
export const BOSS_HELPER_AGENT_EVENT_PORT = '__boss_helper_agent_event_port__'
export const BOSS_HELPER_AGENT_BRIDGE_TOKEN =
  typeof __BOSS_HELPER_AGENT_BRIDGE_TOKEN__ === 'string'
    ? __BOSS_HELPER_AGENT_BRIDGE_TOKEN__
    : 'boss-helper-dev-bridge-token'
export const BOSS_HELPER_AGENT_VERSION = AGENT_PROTOCOL_VERSION

/** Boss 页面里允许 agent 控制的职位相关路由。 */
export const bossHelperSupportedJobPaths = [
  '/web/geek/job',
  '/web/geek/job-recommend',
  '/web/geek/jobs',
] as const
