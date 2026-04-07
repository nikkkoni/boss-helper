import type { Statistics } from '@/types/formData'
import type { FormData } from '@/types/formData'

export const BOSS_HELPER_AGENT_CHANNEL = '__boss_helper_agent__'
export const BOSS_HELPER_AGENT_BRIDGE_REQUEST = '__boss_helper_agent_bridge_request__'
export const BOSS_HELPER_AGENT_BRIDGE_RESPONSE = '__boss_helper_agent_bridge_response__'
export const BOSS_HELPER_AGENT_EVENT_BRIDGE = '__boss_helper_agent_event_bridge__'
export const BOSS_HELPER_AGENT_EVENT_FORWARD = '__boss_helper_agent_event_forward__'
export const BOSS_HELPER_AGENT_EVENT_PORT = '__boss_helper_agent_event_port__'
export const BOSS_HELPER_AGENT_VERSION = 1

export const bossHelperAgentCommands = [
  'start',
  'pause',
  'resume',
  'resume.get',
  'stop',
  'stats',
  'navigate',
  'chat.list',
  'chat.history',
  'chat.send',
  'logs.query',
  'jobs.list',
  'jobs.detail',
  'jobs.review',
  'config.get',
  'config.update',
] as const

export const bossHelperSupportedJobPaths = [
  '/web/geek/job',
  '/web/geek/job-recommend',
  '/web/geek/jobs',
] as const

export type BossHelperAgentCommand = (typeof bossHelperAgentCommands)[number]

export type BossHelperAgentConfigPatch = Partial<FormData>

export type BossHelperAgentJobPipelineStatus =
  | 'pending'
  | 'wait'
  | 'running'
  | 'success'
  | 'error'
  | 'warn'

export type BossHelperAgentState =
  | 'idle'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'completed'
  | 'error'

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
  'chat-sent',
  'job-succeeded',
  'job-filtered',
  'job-failed',
  'rate-limited',
  'limit-reached',
] as const

export type BossHelperAgentEventType = (typeof bossHelperAgentEventTypes)[number]

export interface BossHelperAgentRequest<T extends BossHelperAgentCommand = BossHelperAgentCommand> {
  channel: typeof BOSS_HELPER_AGENT_CHANNEL
  command: T
  payload?: BossHelperAgentRequestPayloadMap[T]
  requestId?: string
  version?: number
}

export interface BossHelperAgentStartPayload {
  configPatch?: BossHelperAgentConfigPatch
  jobIds?: string[]
  persistConfig?: boolean
  resetFiltered?: boolean
}

export interface BossHelperAgentConfigUpdatePayload {
  configPatch: BossHelperAgentConfigPatch
  persist?: boolean
}

export interface BossHelperAgentNavigatePayload {
  city?: string
  page?: number
  position?: string
  query?: string
  url?: string
}

export interface BossHelperAgentJobsListPayload {
  statusFilter?: BossHelperAgentJobPipelineStatus[]
}

export interface BossHelperAgentJobDetailPayload {
  encryptJobId: string
}

export interface BossHelperAgentJobReviewPayload {
  accepted: boolean
  encryptJobId: string
  greeting?: string
  negative?: Array<{ reason: string; score: number }>
  positive?: Array<{ reason: string; score: number }>
  rating?: number
  reason?: string
}

export interface BossHelperAgentChatSendPayload {
  content: string
  form_uid?: number | string
  to_name: string
  to_uid: number | string
}

export interface BossHelperAgentChatListPayload {
  limit?: number
}

export interface BossHelperAgentChatHistoryPayload {
  conversationId: string
  limit?: number
  offset?: number
}

export interface BossHelperAgentLogsQueryPayload {
  from?: string
  limit?: number
  offset?: number
  status?: string[]
  to?: string
}

export interface BossHelperAgentConfigSnapshot {
  config: FormData
}

export interface BossHelperAgentResumeData {
  resumeData: bossZpResumeData
  resumeText: string
  userId: number | string | null
}

export interface BossHelperAgentChatMessage {
  content: string
  conversationId: string
  id: number
  name?: string
  role: 'boss' | 'user' | 'assistant'
  timestamp: string
}

export interface BossHelperAgentChatConversation {
  conversationId: string
  latestMessage: string
  latestTimestamp: string
  messageCount: number
  name?: string
  roles: Array<'boss' | 'user' | 'assistant'>
}

export interface BossHelperAgentChatListData {
  conversations: BossHelperAgentChatConversation[]
  total: number
}

export interface BossHelperAgentChatHistoryData {
  conversationId: string
  items: BossHelperAgentChatMessage[]
  limit: number
  offset: number
  total: number
}

export interface BossHelperAgentValidationError {
  code: string
  field: string
  message: string
}

export interface BossHelperAgentConfigUpdateData extends BossHelperAgentConfigSnapshot {
  errors?: BossHelperAgentValidationError[]
}

export interface BossHelperAgentNavigateData {
  targetUrl: string
}

export interface BossHelperAgentJobSummary {
  areaDistrict: string
  bossName: string
  bossTitle: string
  brandName: string
  brandScaleName: string
  cityName: string
  contact: boolean
  encryptJobId: string
  goldHunter: boolean
  hasCard: boolean
  jobLabels: string[]
  jobName: string
  salaryDesc: string
  skills: string[]
  status: BossHelperAgentJobPipelineStatus
  statusMsg: string
  welfareList: string[]
}

export interface BossHelperAgentJobsListData {
  jobs: BossHelperAgentJobSummary[]
  total: number
  totalOnPage: number
}

export interface BossHelperAgentJobDetail extends BossHelperAgentJobSummary {
  activeTimeDesc: string
  address: string
  brandIndustry: string
  degreeName: string
  experienceName: string
  friendStatus: number | null
  gps: {
    latitude: number
    longitude: number
  } | null
  postDescription: string
}

export interface BossHelperAgentJobDetailData {
  job: BossHelperAgentJobDetail
}

export interface BossHelperAgentLogEntry {
  aiScore?: Record<string, unknown>
  brandName: string
  encryptJobId: string
  error?: string
  greeting?: string
  jobName: string
  message?: string
  status: string
  timestamp: string
}

export interface BossHelperAgentLogsQueryData {
  items: BossHelperAgentLogEntry[]
  limit: number
  offset: number
  total: number
}

export interface BossHelperAgentRequestPayloadMap {
  start: BossHelperAgentStartPayload | undefined
  pause: undefined
  resume: undefined
  'resume.get': undefined
  stop: undefined
  stats: undefined
  navigate: BossHelperAgentNavigatePayload | undefined
  'chat.list': BossHelperAgentChatListPayload | undefined
  'chat.history': BossHelperAgentChatHistoryPayload
  'chat.send': BossHelperAgentChatSendPayload
  'logs.query': BossHelperAgentLogsQueryPayload | undefined
  'jobs.list': BossHelperAgentJobsListPayload | undefined
  'jobs.detail': BossHelperAgentJobDetailPayload
  'jobs.review': BossHelperAgentJobReviewPayload
  'config.get': undefined
  'config.update': BossHelperAgentConfigUpdatePayload
}

export interface BossHelperAgentCurrentJob {
  brandName: string
  encryptJobId: string
  jobName: string
  message: string
  status: string
}

export interface BossHelperAgentProgress {
  activeTargetJobIds: string[]
  current: number
  currentJob: BossHelperAgentCurrentJob | null
  locked: boolean
  message: string
  page: number
  pageSize: number
  state: BossHelperAgentState
  stopRequested: boolean
  remainingTargetJobIds: string[]
  total: number
}

export interface BossHelperAgentStatsData {
  historyData: Statistics[]
  progress: BossHelperAgentProgress
  todayData: Statistics
}

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

export interface BossHelperAgentResponse<T = BossHelperAgentStatsData> {
  code: string
  data?: T
  message: string
  ok: boolean
}

export type BossHelperAgentResponseDataMap = {
  start: BossHelperAgentStatsData
  pause: BossHelperAgentStatsData
  resume: BossHelperAgentStatsData
  'resume.get': BossHelperAgentResumeData
  stop: BossHelperAgentStatsData
  stats: BossHelperAgentStatsData
  navigate: BossHelperAgentNavigateData
  'chat.list': BossHelperAgentChatListData
  'chat.history': BossHelperAgentChatHistoryData
  'chat.send': BossHelperAgentStatsData
  'logs.query': BossHelperAgentLogsQueryData
  'jobs.list': BossHelperAgentJobsListData
  'jobs.detail': BossHelperAgentJobDetailData
  'jobs.review': BossHelperAgentStatsData
  'config.get': BossHelperAgentConfigSnapshot
  'config.update': BossHelperAgentConfigUpdateData
}

export interface BossHelperAgentBridgeRequest {
  payload: BossHelperAgentRequest
  requestId: string
  type: typeof BOSS_HELPER_AGENT_BRIDGE_REQUEST
}

export interface BossHelperAgentBridgeResponse {
  payload: BossHelperAgentResponse
  requestId: string
  type: typeof BOSS_HELPER_AGENT_BRIDGE_RESPONSE
}

export interface BossHelperAgentEventBridgeMessage {
  payload: BossHelperAgentEvent
  type: typeof BOSS_HELPER_AGENT_EVENT_BRIDGE
}

export interface BossHelperAgentEventForwardMessage {
  payload: BossHelperAgentEvent
  type: typeof BOSS_HELPER_AGENT_EVENT_FORWARD
}

export interface BossHelperAgentController {
  configGet: () => Promise<BossHelperAgentResponse<BossHelperAgentConfigSnapshot>>
  configUpdate: (
    payload: BossHelperAgentConfigUpdatePayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentConfigUpdateData>>
  handle: (request: BossHelperAgentRequest) => Promise<BossHelperAgentResponse<unknown>>
  jobsDetail: (
    payload: BossHelperAgentJobDetailPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentJobDetailData>>
  jobsList: (
    payload?: BossHelperAgentJobsListPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentJobsListData>>
  jobsReview: (payload: BossHelperAgentJobReviewPayload) => Promise<BossHelperAgentResponse>
  logsQuery: (
    payload?: BossHelperAgentLogsQueryPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentLogsQueryData>>
  navigate: (
    payload?: BossHelperAgentNavigatePayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentNavigateData>>
  chatHistory: (
    payload: BossHelperAgentChatHistoryPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentChatHistoryData>>
  chatList: (
    payload?: BossHelperAgentChatListPayload,
  ) => Promise<BossHelperAgentResponse<BossHelperAgentChatListData>>
  chatSend: (payload: BossHelperAgentChatSendPayload) => Promise<BossHelperAgentResponse>
  pause: () => Promise<BossHelperAgentResponse>
  resume: () => Promise<BossHelperAgentResponse>
  resumeGet: () => Promise<BossHelperAgentResponse<BossHelperAgentResumeData>>
  start: (payload?: BossHelperAgentStartPayload) => Promise<BossHelperAgentResponse>
  stop: () => Promise<BossHelperAgentResponse>
  stats: () => Promise<BossHelperAgentResponse>
}

export function createBossHelperAgentResponse<T = BossHelperAgentStatsData>(
  ok: boolean,
  code: string,
  message: string,
  data?: T,
): BossHelperAgentResponse<T> {
  return {
    ok,
    code,
    message,
    data,
  }
}

export function isBossHelperAgentRequest(value: unknown): value is BossHelperAgentRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<BossHelperAgentRequest>
  return (
    request.channel === BOSS_HELPER_AGENT_CHANNEL &&
    typeof request.command === 'string' &&
    bossHelperAgentCommands.includes(request.command as BossHelperAgentCommand)
  )
}

export function isBossHelperAgentBridgeRequest(
  value: unknown,
): value is BossHelperAgentBridgeRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<BossHelperAgentBridgeRequest>
  return (
    request.type === BOSS_HELPER_AGENT_BRIDGE_REQUEST &&
    typeof request.requestId === 'string' &&
    isBossHelperAgentRequest(request.payload)
  )
}

export function isBossHelperAgentBridgeResponse(
  value: unknown,
): value is BossHelperAgentBridgeResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<BossHelperAgentBridgeResponse>
  return (
    response.type === BOSS_HELPER_AGENT_BRIDGE_RESPONSE &&
    typeof response.requestId === 'string' &&
    !!response.payload &&
    typeof response.payload === 'object' &&
    typeof response.payload.ok === 'boolean' &&
    typeof response.payload.code === 'string' &&
    typeof response.payload.message === 'string'
  )
}

export function isBossHelperAgentEvent(value: unknown): value is BossHelperAgentEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<BossHelperAgentEvent>
  return (
    typeof event.id === 'string' &&
    typeof event.createdAt === 'string' &&
    typeof event.message === 'string' &&
    typeof event.type === 'string' &&
    bossHelperAgentEventTypes.includes(event.type as BossHelperAgentEventType)
  )
}

export function isBossHelperAgentEventBridgeMessage(
  value: unknown,
): value is BossHelperAgentEventBridgeMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<BossHelperAgentEventBridgeMessage>
  return (
    message.type === BOSS_HELPER_AGENT_EVENT_BRIDGE &&
    isBossHelperAgentEvent(message.payload)
  )
}

export function isBossHelperAgentEventForwardMessage(
  value: unknown,
): value is BossHelperAgentEventForwardMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<BossHelperAgentEventForwardMessage>
  return (
    message.type === BOSS_HELPER_AGENT_EVENT_FORWARD &&
    isBossHelperAgentEvent(message.payload)
  )
}

export function isBossHelperSupportedJobUrl(url?: string | null) {
  if (!url) return false
  try {
    const { pathname } = new URL(url)
    return bossHelperSupportedJobPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  } catch {
    return false
  }
}