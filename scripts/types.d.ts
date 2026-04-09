export interface AgentBridgeRuntime {
  host: string
  port: number
  httpsPort: number
  token: string
  httpBaseUrl: string
  httpsBaseUrl: string
}

export interface AgentBridgeCertificate {
  cert: string
  key: string
}

export interface AgentBridgeResponse {
  ok?: boolean
  code?: string
  message?: string
  [key: string]: any
}

export interface AgentCliOptions {
  host: string
  port: number
  timeoutMs?: number
  payload?: unknown
  stopOnError: boolean
  waitForRelay: boolean
  command: string
}

export interface AgentLaunchOptions {
  browser: string
  extensionId: string
  host: string
  noOpen: boolean
  port: number
}

export type AgentReviewMode = 'none' | 'heuristic' | 'accept' | 'reject'

export interface AgentOrchestratorOptions {
  host: string
  port: number
  url: string
  query: string
  city: string
  position: string
  page?: number
  settleMs: number
  jobLimit: number
  detailLimit: number
  include: string[]
  exclude: string[]
  minScore: number
  start: boolean
  watch: boolean
  watchMs: number
  reviewMode: AgentReviewMode
  greetingTemplate: string
  printResume: boolean
  help: boolean
}

export interface AgentScoreItem {
  reason: string
  score: number
}

export interface AgentJobDetail {
  job: Record<string, any>
  [key: string]: any
}

export interface AgentJobAnalysis {
  accepted: boolean
  detail: AgentJobDetail
  score: number
  positive: AgentScoreItem[]
  negative: AgentScoreItem[]
  reason: string
}

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args?: Record<string, any>) => Promise<Record<string, any>>
}
