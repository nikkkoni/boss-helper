// @ts-check

export { AGENT_PROTOCOL_VERSION } from '../../shared/agentProtocol.js'

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
  'config',
  'events',
  'jobs',
  'logs',
  'resume',
  'stats',
])

export const DEFAULT_AGENT_CONTEXT_SECTIONS = Object.freeze([
  'config',
  'events',
  'jobs',
  'resume',
  'stats',
])