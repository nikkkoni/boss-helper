// @ts-check

export {
  AGENT_PROTOCOL_VERSION,
  BOSS_HELPER_AGENT_SUGGESTED_ACTIONS,
  resolveBossHelperAgentErrorMeta,
} from '../../shared/agentProtocol.js'

export const MCP_PROTOCOL_VERSION = '2024-11-05'

export const MCP_SERVER_INFO = Object.freeze({
  name: 'boss-helper-agent-mcp',
  version: '1.0.0',
})

export const JOB_STATUS_FILTERS = Object.freeze([
  'pending',
  'wait',
  'running',
  'success',
  'error',
  'warn',
])

export const AGENT_CONTEXT_SECTIONS = Object.freeze([
  'readiness',
  'config',
  'events',
  'jobs',
  'logs',
  'plan',
  'resume',
  'stats',
])

export const DEFAULT_AGENT_CONTEXT_SECTIONS = Object.freeze([
  'readiness',
  'config',
  'events',
  'jobs',
  'resume',
  'stats',
])
