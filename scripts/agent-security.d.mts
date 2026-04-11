export const repoRoot: string
export const AGENT_BRIDGE_TOKEN_ENV: string
export const AGENT_BRIDGE_HOST_ENV: string
export const AGENT_BRIDGE_PORT_ENV: string
export const AGENT_BRIDGE_HTTPS_PORT_ENV: string
export const AGENT_BRIDGE_AUTH_HEADER: string
export const AGENT_BRIDGE_EVENT_PORT_PREFIX: string

export interface AgentBridgeRuntime {
  host: string
  port: number
  httpsPort: number
  token: string
  httpBaseUrl: string
  httpsBaseUrl: string
}

export function getAgentBridgeHost(env?: NodeJS.ProcessEnv): string
export function getAgentBridgePort(env?: NodeJS.ProcessEnv): number
export function getAgentBridgeHttpsPort(env?: NodeJS.ProcessEnv): number
export function getAgentBridgeTokenSync(env?: NodeJS.ProcessEnv): string
export function getAgentBridgeRuntime(env?: NodeJS.ProcessEnv): AgentBridgeRuntime
export function createAgentBridgeAuthHeaders(
  token: string,
  headers?: Record<string, string>,
): Record<string, string>
export function getAgentBridgeEventPortName(token: string): string
export function getAgentBridgeCertificate(
  env?: NodeJS.ProcessEnv,
): Promise<{ cert: string; key: string }>
