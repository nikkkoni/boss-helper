#!/usr/bin/env node

// @ts-check

import { Buffer } from 'node:buffer'
import { stdin, stdout, stderr, env } from 'node:process'

import { AGENT_PROTOCOL_VERSION } from '../shared/agentProtocol.js'
import {
  createAgentBridgeAuthHeaders,
  getAgentBridgeRuntime,
} from './agent-security.mjs'

/** @typedef {import('./types.d.ts').McpToolDefinition} McpToolDefinition */
/** @typedef {import('./types.d.ts').McpResourceDefinition} McpResourceDefinition */
/** @typedef {import('./types.d.ts').McpPromptDefinition} McpPromptDefinition */

const bridgeRuntime = getAgentBridgeRuntime(env)
const BRIDGE_BASE_URL = bridgeRuntime.httpBaseUrl
const MCP_PROTOCOL_VERSION = '2024-11-05'
const MAX_STDIN_CONTENT_LENGTH = Number.parseInt(
  env.BOSS_HELPER_AGENT_MCP_MAX_CONTENT_LENGTH ?? `${1024 * 1024}`,
  10,
)
const JOB_STATUS_FILTERS = ['pending', 'wait', 'running', 'success', 'error', 'warn']
const AGENT_CONTEXT_SECTIONS = ['config', 'events', 'jobs', 'logs', 'resume', 'stats']
const DEFAULT_AGENT_CONTEXT_SECTIONS = ['config', 'events', 'jobs', 'resume', 'stats']

/** @type {McpToolDefinition[]} */
const TOOL_DEFINITIONS = [
  {
    name: 'boss_helper_health',
    description: '检查 boss-helper bridge 是否在线。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => bridgeGet('/health'),
  },
  {
    name: 'boss_helper_status',
    description: '获取 bridge、relay、事件订阅与排队状态。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => bridgeGet('/status'),
  },
  {
    name: 'boss_helper_agent_context',
    description: '聚合 bridge、事件和页面上下文，帮助外部 Agent 规划下一步。',
    inputSchema: {
      type: 'object',
      properties: {
        include: {
          type: 'array',
          items: { type: 'string', enum: AGENT_CONTEXT_SECTIONS },
        },
        eventTypes: { type: 'array', items: { type: 'string' } },
        jobsLimit: { type: 'number' },
        logsLimit: { type: 'number' },
        statusFilter: {
          type: 'array',
          items: { type: 'string', enum: JOB_STATUS_FILTERS },
        },
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    handler: (args) => readAgentContext(args),
  },
  {
    name: 'boss_helper_start',
    description: '启动投递任务，可选传入 jobIds、configPatch、persistConfig、resetFiltered。',
    inputSchema: {
      type: 'object',
      properties: {
        jobIds: { type: 'array', items: { type: 'string' } },
        configPatch: { type: 'object' },
        persistConfig: { type: 'boolean' },
        resetFiltered: { type: 'boolean' },
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    handler: (args) => commandCall('start', args),
  },
  {
    name: 'boss_helper_pause',
    description: '暂停当前投递任务。',
    inputSchema: simpleCommandSchema(),
    handler: (args) => commandCall('pause', args),
  },
  {
    name: 'boss_helper_resume',
    description: '恢复已暂停的投递任务。',
    inputSchema: simpleCommandSchema(),
    handler: (args) => commandCall('resume', args),
  },
  {
    name: 'boss_helper_stop',
    description: '彻底停止当前任务并重置中间状态。',
    inputSchema: simpleCommandSchema(),
    handler: (args) => commandCall('stop', args),
  },
  {
    name: 'boss_helper_stats',
    description: '读取当前进度、今日统计和历史统计。',
    inputSchema: simpleCommandSchema(),
    handler: (args) => commandCall('stats', args),
  },
  {
    name: 'boss_helper_navigate',
    description: '导航到 Boss 职位搜索页，支持 url、query、city、position、page。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        query: { type: 'string' },
        city: { type: 'string' },
        position: { type: 'string' },
        page: { type: 'number' },
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    handler: (args) => commandCall('navigate', args),
  },
  {
    name: 'boss_helper_resume_get',
    description: '读取当前账号的结构化简历数据和文本摘要。',
    inputSchema: simpleCommandSchema(),
    handler: (args) => commandCall('resume.get', args),
  },
  {
    name: 'boss_helper_jobs_list',
    description: '读取当前页面职位摘要列表，可按状态过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        statusFilter: {
          type: 'array',
          items: { type: 'string', enum: JOB_STATUS_FILTERS },
        },
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    handler: (args) => commandCall('jobs.list', args),
  },
  {
    name: 'boss_helper_jobs_detail',
    description: '读取单个职位的完整详情，可能需要等待页面加载卡片。',
    inputSchema: {
      type: 'object',
      properties: {
        encryptJobId: { type: 'string' },
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      required: ['encryptJobId'],
      additionalProperties: false,
    },
    handler: (args) => commandCall('jobs.detail', args),
  },
  {
    name: 'boss_helper_jobs_review',
    description: '提交外部 AI 审核结果，用于处理 job-pending-review。',
    inputSchema: {
      type: 'object',
      properties: {
        encryptJobId: { type: 'string' },
        accepted: { type: 'boolean' },
        greeting: { type: 'string' },
        rating: { type: 'number' },
        reason: { type: 'string' },
        positive: scoreArraySchema(),
        negative: scoreArraySchema(),
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      required: ['encryptJobId', 'accepted'],
      additionalProperties: false,
    },
    handler: (args) => commandCall('jobs.review', args),
  },
  {
    name: 'boss_helper_logs_query',
    description: '读取结构化投递日志。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        offset: { type: 'number' },
        status: { type: 'array', items: { type: 'string' } },
        from: { type: 'string' },
        to: { type: 'string' },
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    handler: (args) => commandCall('logs.query', args),
  },
  {
    name: 'boss_helper_chat_list',
    description: '读取当前页面采集到的聊天会话摘要。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    handler: (args) => commandCall('chat.list', args),
  },
  {
    name: 'boss_helper_chat_history',
    description: '读取当前页面采集到的某个会话历史。',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      required: ['conversationId'],
      additionalProperties: false,
    },
    handler: (args) => commandCall('chat.history', args),
  },
  {
    name: 'boss_helper_chat_send',
    description: '通过当前页面可用的 Boss 通道发送聊天消息。',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        to_uid: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        to_name: { type: 'string' },
        form_uid: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      required: ['content', 'to_uid', 'to_name'],
      additionalProperties: false,
    },
    handler: (args) => commandCall('chat.send', args),
  },
  {
    name: 'boss_helper_config_get',
    description: '读取当前运行时配置快照。',
    inputSchema: simpleCommandSchema(),
    handler: (args) => commandCall('config.get', args),
  },
  {
    name: 'boss_helper_config_update',
    description: '更新运行时配置，返回字段级校验错误或更新结果。',
    inputSchema: {
      type: 'object',
      properties: {
        configPatch: { type: 'object' },
        persist: { type: 'boolean' },
        timeoutMs: { type: 'number' },
        waitForRelay: { type: 'boolean' },
      },
      required: ['configPatch'],
      additionalProperties: false,
    },
    handler: (args) => commandCall('config.update', args),
  },
  {
    name: 'boss_helper_batch',
    description: '顺序执行一组命令，可选 stopOnError。',
    inputSchema: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              payload: { type: 'object' },
              timeoutMs: { type: 'number' },
            },
            required: ['command'],
            additionalProperties: true,
          },
        },
        stopOnError: { type: 'boolean' },
        waitForRelay: { type: 'boolean' },
      },
      required: ['commands'],
      additionalProperties: false,
    },
    handler: (args) => batchCall(args),
  },
  {
    name: 'boss_helper_events_recent',
    description: '读取最近的 agent 事件快照，可按 types 过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        types: { type: 'array', items: { type: 'string' } },
        timeoutMs: { type: 'number' },
      },
      additionalProperties: false,
    },
    handler: (args) => readRecentEvents(args),
  },
  {
    name: 'boss_helper_wait_for_event',
    description: '等待下一条匹配的 agent 事件，可按 types 过滤并设置超时。',
    inputSchema: {
      type: 'object',
      properties: {
        types: { type: 'array', items: { type: 'string' } },
        timeoutMs: { type: 'number' },
      },
      additionalProperties: false,
    },
    handler: (args) => waitForNextEvent(args),
  },
]

const toolMap = new Map(TOOL_DEFINITIONS.map((tool) => [tool.name, tool]))

/** @type {McpResourceDefinition[]} */
const RESOURCE_DEFINITIONS = [
  {
    uri: 'boss-helper://guides/autonomy-workflow',
    name: 'Boss Helper Autonomy Workflow',
    description: '推荐的自主投递调用顺序、观察点和恢复策略。',
    mimeType: 'text/markdown',
    read: async () => makeResourceContent(
      'boss-helper://guides/autonomy-workflow',
      'text/markdown',
      buildAutonomyWorkflowResource(),
    ),
  },
  {
    uri: 'boss-helper://guides/review-loop',
    name: 'Boss Helper Review Loop',
    description: '处理 job-pending-review 事件的外部审核闭环说明。',
    mimeType: 'text/markdown',
    read: async () => makeResourceContent(
      'boss-helper://guides/review-loop',
      'text/markdown',
      buildReviewLoopResource(),
    ),
  },
  {
    uri: 'boss-helper://runtime/bridge-context',
    name: 'Boss Helper Bridge Context',
    description: '当前 bridge/relay 就绪情况、推荐工具和下一步建议。',
    mimeType: 'application/json',
    read: async () => makeResourceContent(
      'boss-helper://runtime/bridge-context',
      'application/json',
      JSON.stringify(await buildBridgeContextResource(), null, 2),
    ),
  },
]

const resourceMap = new Map(RESOURCE_DEFINITIONS.map((resource) => [resource.uri, resource]))

/** @type {McpPromptDefinition[]} */
const PROMPT_DEFINITIONS = [
  {
    name: 'boss_helper_targeted_delivery',
    description: '生成一段先观察再执行的定向投递工作流提示。',
    arguments: [
      {
        name: 'goal',
        description: '目标岗位、领域或求职结果，例如“上海前端岗位，优先 Vue”。',
        required: true,
      },
      {
        name: 'constraints',
        description: '额外约束，例如城市、薪资、公司类型或排除项。',
      },
      {
        name: 'keywords',
        description: '优先关注的关键词，逗号分隔即可。',
      },
    ],
    handler: async (args) => makePromptResult(
      'Boss Helper 定向投递提示模板',
      buildTargetedDeliveryPrompt(args),
    ),
  },
  {
    name: 'boss_helper_review_closure',
    description: '生成处理 job-pending-review 事件的审核闭环提示。',
    arguments: [
      {
        name: 'policy',
        description: '审核策略，例如“优先稳定性、少量高匹配岗位”。',
      },
      {
        name: 'greetingStyle',
        description: '通过审核时招呼语的风格，例如“简洁职业、不要模板腔”。',
      },
    ],
    handler: async (args) => makePromptResult(
      'Boss Helper 外部审核闭环提示模板',
      buildReviewClosurePrompt(args),
    ),
  },
]

const promptMap = new Map(PROMPT_DEFINITIONS.map((prompt) => [prompt.name, prompt]))

function simpleCommandSchema() {
  return {
    type: 'object',
    properties: {
      timeoutMs: { type: 'number' },
      waitForRelay: { type: 'boolean' },
    },
    additionalProperties: false,
  }
}

function scoreArraySchema() {
  return {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        score: { type: 'number' },
      },
      required: ['reason', 'score'],
      additionalProperties: false,
    },
  }
}

function makeResourceContent(uri, mimeType, text) {
  return {
    uri,
    mimeType,
    text,
  }
}

/**
 * @param {string} description
 * @param {string} text
 * @returns {{ description: string, messages: import('./types.d.ts').McpPromptMessage[] }}
 */
function makePromptResult(description, text) {
  return {
    description,
    messages: [
      {
        /** @type {'user'} */
        role: 'user',
        content: {
          /** @type {'text'} */
          type: 'text',
          text,
        },
      },
    ],
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function normalizeAgentContextSections(value) {
  const sections = normalizeStringArray(value).filter((item) => AGENT_CONTEXT_SECTIONS.includes(item))
  return sections.length > 0 ? sections : [...DEFAULT_AGENT_CONTEXT_SECTIONS]
}

function normalizePositiveNumber(value) {
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : 'unknown error'
}

function formatSectionResult(result, options = {}) {
  const envelope = result?.data
  const unwrapCommandData = options.unwrapCommandData === true
  const payload =
    unwrapCommandData && envelope && typeof envelope === 'object' && 'data' in envelope
      ? envelope.data
      : envelope ?? null

  return {
    ok: result?.ok !== false,
    status: typeof result?.status === 'number' ? result.status : undefined,
    code: typeof envelope?.code === 'string' ? envelope.code : undefined,
    message: typeof envelope?.message === 'string' ? envelope.message : undefined,
    data: payload,
  }
}

async function safeBridgeSection(path) {
  try {
    return formatSectionResult(await bridgeGet(path))
  } catch (error) {
    return {
      ok: false,
      code: 'bridge-request-failed',
      message: toErrorMessage(error),
      data: null,
    }
  }
}

async function safeCommandSection(command, args) {
  try {
    return formatSectionResult(await commandCall(command, args), { unwrapCommandData: true })
  } catch (error) {
    return {
      ok: false,
      code: 'command-request-failed',
      message: toErrorMessage(error),
      data: null,
    }
  }
}

async function safeEventSection(args = {}) {
  try {
    return formatSectionResult(await readRecentEvents(args))
  } catch (error) {
    return {
      ok: false,
      code: 'event-request-failed',
      message: toErrorMessage(error),
      data: null,
    }
  }
}

function getPromptArg(args, name, fallback = '') {
  const value = args?.[name]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function joinPromptDetails(values, fallback) {
  const items = Array.isArray(values)
    ? normalizeStringArray(values)
    : typeof values === 'string'
      ? values
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  return items.length > 0 ? items.join(', ') : fallback
}

function buildAutonomyWorkflowResource() {
  return `# Boss Helper Autonomy Workflow

把 Boss Helper 当成自主执行器时，推荐遵循下面的顺序，而不是直接调用 \`boss_helper_start\`。

1. 先调用 \`boss_helper_health\`、\`boss_helper_status\`，确认 bridge 和 relay 在线。
2. 再调用 \`boss_helper_agent_context\`，一次性读取运行上下文、最近事件和下一步建议。
3. 如有必要，用 \`boss_helper_navigate\` 切换到目标搜索页。
4. 用 \`boss_helper_jobs_list\` 获取候选岗位，再对少量高价值岗位调用 \`boss_helper_jobs_detail\`。
5. 用 \`boss_helper_resume_get\` 把判断建立在真实简历上，而不是凭空猜测。
6. 只对明确筛出的岗位调用 \`boss_helper_start\`，并显式传入 \`jobIds\`。
7. 运行中优先通过 \`boss_helper_events_recent\`、\`boss_helper_wait_for_event\` 观察进度，不要盲轮询。
8. 收到 \`job-pending-review\` 后，必须补完 \`boss_helper_jobs_review\` 审核闭环。
9. 异常时优先调用 \`boss_helper_stop\`，不要把系统长期停在不确定状态。

恢复策略：

- \`relay-not-connected\`：先打开 relay 页面并确认扩展已连接。
- \`target-tab-not-found\`：先打开 Boss 职位页并等待扩展初始化完成。
- \`validation-failed\`：修正参数后再重试，不要重复提交同一个错误 patch。
- \`review-not-found\`：说明待审核岗位已过期或已被处理，先刷新上下文再决策。
`
}

function buildReviewLoopResource() {
  return `# Boss Helper Review Loop

当运行中的岗位触发 \`job-pending-review\` 时，外部 Agent 应按下面的闭环处理：

1. 读取事件中的 \`encryptJobId\`、基础岗位信息和触发原因。
2. 如事件信息不足，再调用 \`boss_helper_jobs_detail\` 获取完整职位描述。
3. 必要时结合 \`boss_helper_resume_get\`，确认岗位和简历是否真实匹配。
4. 调用 \`boss_helper_jobs_review\` 提交结构化决策：
   - \`accepted\`
   - \`rating\`
   - \`reason\`
   - \`positive\`
   - \`negative\`
   - \`greeting\`（只在接受时填写）
5. 如果返回 \`review-not-found\`，不要盲重试，先重新读取事件和岗位上下文。

建议：

- 审核理由尽量具体，避免“感觉不错”这类空泛结论。
- 拒绝时不需要生成招呼语。
- 接受时的招呼语要基于岗位与简历匹配点，而不是通用模板。
`
}

function buildTargetedDeliveryPrompt(args = {}) {
  const goal = getPromptArg(args, 'goal', '未指定目标')
  const constraints = getPromptArg(args, 'constraints', '无额外约束')
  const keywords = joinPromptDetails(getPromptArg(args, 'keywords'), '无显式关键词')

  return `你现在要把 Boss Helper 当作求职执行器，而不是简单的远程按钮。

目标：${goal}
约束：${constraints}
优先关键词：${keywords}

请按下面顺序工作：

1. 先调用 \`boss_helper_health\`、\`boss_helper_status\`、\`boss_helper_agent_context\`，确认 bridge、relay、页面上下文和推荐下一步。
2. 如果当前页面不在目标搜索场景，调用 \`boss_helper_navigate\`。
3. 用 \`boss_helper_jobs_list\` 找候选岗位，只对少量高价值岗位调用 \`boss_helper_jobs_detail\`。
4. 用 \`boss_helper_resume_get\` 校验岗位和真实简历的匹配度。
5. 只有在明确选中岗位后，才调用 \`boss_helper_start\`，并传入明确的 \`jobIds\`。
6. 运行中优先用 \`boss_helper_wait_for_event\` 或 \`boss_helper_events_recent\` 观察结果。
7. 如果收到 \`job-pending-review\`，必须完成 \`boss_helper_jobs_review\` 的结构化审核闭环。
8. 遇到 \`relay-not-connected\`、\`target-tab-not-found\`、\`validation-failed\` 时，先自我修正上下文或参数，再继续执行。

每一步都先说明你的判断依据，再调用工具。不要无条件对整页岗位直接执行 \`boss_helper_start\`。`
}

function buildReviewClosurePrompt(args = {}) {
  const policy = getPromptArg(args, 'policy', '优先高匹配、低风险岗位')
  const greetingStyle = getPromptArg(args, 'greetingStyle', '简洁、职业、贴合岗位亮点')

  return `你正在处理 Boss Helper 的 \`job-pending-review\` 事件。

审核策略：${policy}
招呼语风格：${greetingStyle}

请按下面闭环执行：

1. 从事件里提取 \`encryptJobId\` 和当前岗位上下文。
2. 如信息不完整，调用 \`boss_helper_jobs_detail\`；如需要确认履历匹配，再调用 \`boss_helper_resume_get\`。
3. 基于真实岗位描述做明确结论，而不是泛化判断。
4. 调用 \`boss_helper_jobs_review\` 时，必须提交 \`accepted\`、\`rating\`、\`reason\`、\`positive\`、\`negative\`。
5. 只有在 \`accepted=true\` 时才附带 \`greeting\`，且内容要体现岗位与简历的真实匹配点。
6. 如果返回 \`review-not-found\`，说明事件已失效或被处理，先刷新上下文，不要盲重试同一请求。

你的输出重点是：给出可追溯的审核依据，并确保 tool 参数结构完整。`
}

function buildBridgeRecommendations(healthSection, statusSection) {
  if (healthSection.ok === false) {
    return ['bridge 当前不可用，先确认本地 companion 服务已经启动，再重试 MCP tools。']
  }

  if (statusSection.data?.relayConnected !== true) {
    return [`relay 尚未连接，先在 ${bridgeRuntime.httpsBaseUrl}/ 打开 relay 页面并连接扩展。`]
  }

  return [
    'bridge 与 relay 已就绪，可以先调用 boss_helper_agent_context 聚合页面上下文，再决定是否 navigate / jobs.list / start。',
  ]
}

async function buildBridgeContextResource() {
  const health = await safeBridgeSection('/health')
  const status = await safeBridgeSection('/status')

  return {
    agentProtocolVersion: AGENT_PROTOCOL_VERSION,
    bridge: {
      host: bridgeRuntime.host,
      httpBaseUrl: BRIDGE_BASE_URL,
      httpsRelayUrl: `${bridgeRuntime.httpsBaseUrl}/`,
      port: bridgeRuntime.port,
      httpsPort: bridgeRuntime.httpsPort,
    },
    readiness: {
      bridgeOnline: health.ok,
      relayConnected: status.data?.relayConnected === true,
      relayCount: Array.isArray(status.data?.relays) ? status.data.relays.length : 0,
      recentEventCount: Number.isFinite(status.data?.recentEventCount) ? status.data.recentEventCount : 0,
    },
    recommendedTools: [
      'boss_helper_agent_context',
      'boss_helper_navigate',
      'boss_helper_jobs_list',
      'boss_helper_jobs_detail',
      'boss_helper_start',
      'boss_helper_wait_for_event',
      'boss_helper_jobs_review',
    ],
    nextSteps: buildBridgeRecommendations(health, status),
  }
}

function buildAgentContextRecommendations(sections, readiness, summary) {
  if (!readiness.bridgeOnline) {
    return ['bridge 当前不可用，先恢复 companion 服务，再继续任何页面级操作。']
  }

  if (!readiness.relayConnected) {
    return [`relay 未连接，先在 ${bridgeRuntime.httpsBaseUrl}/ 打开 relay 页面并连接扩展。`]
  }

  const recommendations = []

  if (sections.jobs?.ok === false) {
    recommendations.push('职位列表暂不可读，优先调用 boss_helper_navigate 切到目标搜索页后再重试。')
  }

  if (sections.resume?.ok === false) {
    recommendations.push('简历快照暂不可读，必要时重新打开 Boss 页面后再调用 boss_helper_resume_get。')
  }

  if (summary.pendingReviewCount > 0) {
    recommendations.push(`检测到 ${summary.pendingReviewCount} 个待审核事件，优先处理 job-pending-review -> boss_helper_jobs_review 闭环。`)
  }

  if (summary.jobsVisibleCount > 0) {
    recommendations.push(`当前页面可见 ${summary.jobsVisibleCount} 个候选职位，先筛选再调用 boss_helper_jobs_detail，避免盲目 start。`)
  }

  if (recommendations.length === 0) {
    recommendations.push('运行上下文已准备好，可以继续做定向分析、启动投递或订阅事件。')
  }

  return recommendations
}

async function readAgentContext(args = {}) {
  const sections = normalizeAgentContextSections(args.include)
  const timeoutMs = normalizePositiveNumber(args.timeoutMs)
  const waitForRelay = typeof args.waitForRelay === 'boolean' ? args.waitForRelay : undefined

  const health = await safeBridgeSection('/health')
  const status = await safeBridgeSection('/status')

  const sectionResults = {
    health,
    status,
  }

  for (const section of sections) {
    switch (section) {
      case 'config':
        sectionResults.config = await safeCommandSection('config.get', { timeoutMs, waitForRelay })
        break
      case 'events':
        sectionResults.events = await safeEventSection({
          timeoutMs: timeoutMs ?? 5_000,
          types: args.eventTypes,
        })
        break
      case 'jobs':
        sectionResults.jobs = await safeCommandSection('jobs.list', {
          statusFilter: args.statusFilter,
          timeoutMs,
          waitForRelay,
        })
        if (Array.isArray(sectionResults.jobs.data?.jobs) && Number.isFinite(args.jobsLimit) && args.jobsLimit > 0) {
          sectionResults.jobs.data = {
            ...sectionResults.jobs.data,
            jobs: sectionResults.jobs.data.jobs.slice(0, Math.max(1, Number(args.jobsLimit))),
          }
        }
        break
      case 'logs':
        sectionResults.logs = await safeCommandSection('logs.query', {
          limit: Number.isFinite(args.logsLimit) && args.logsLimit > 0 ? Number(args.logsLimit) : 10,
          timeoutMs,
          waitForRelay,
        })
        break
      case 'resume':
        sectionResults.resume = await safeCommandSection('resume.get', { timeoutMs, waitForRelay })
        break
      case 'stats':
        sectionResults.stats = await safeCommandSection('stats', { timeoutMs, waitForRelay })
        break
      default:
        break
    }
  }

  const jobsVisibleCount = Array.isArray(sectionResults.jobs?.data?.jobs) ? sectionResults.jobs.data.jobs.length : 0
  const recentEvents = Array.isArray(sectionResults.events?.data?.recent) ? sectionResults.events.data.recent : []
  const pendingReviewCount = recentEvents.filter((event) => event?.type === 'job-pending-review').length
  const relayCount = Array.isArray(status.data?.relays) ? status.data.relays.length : 0
  const statsData = sectionResults.stats?.data
  const todayDelivered = Number.isFinite(statsData?.today?.delivered)
    ? statsData.today.delivered
    : Number.isFinite(statsData?.today?.success)
      ? statsData.today.success
      : null

  const readiness = {
    bridgeOnline: health.ok,
    relayConnected: status.data?.relayConnected === true,
    pageControllable: health.ok && status.data?.relayConnected === true,
    relayCount,
  }

  const summary = {
    hasResume: sectionResults.resume?.ok === true,
    hasStats: sectionResults.stats?.ok === true,
    jobsVisibleCount,
    pendingReviewCount,
    recentEventCount: recentEvents.length,
    todayDelivered,
  }

  return {
    ok: true,
    agentProtocolVersion: AGENT_PROTOCOL_VERSION,
    bridge: {
      httpBaseUrl: BRIDGE_BASE_URL,
      httpsRelayUrl: `${bridgeRuntime.httpsBaseUrl}/`,
    },
    requestedSections: sections,
    readiness,
    summary,
    sections: sectionResults,
    recommendations: buildAgentContextRecommendations(sectionResults, readiness, summary),
  }
}

function writeMessage(message) {
  const json = JSON.stringify(message)
  const payload = Buffer.from(json, 'utf8')
  const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8')
  stdout.write(Buffer.concat([header, payload]))
}

function sendResult(id, result) {
  if (id == null) return
  writeMessage({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message, data = undefined) {
  if (id === undefined) return
  writeMessage({
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      data,
    },
  })
}

function logError(...args) {
  stderr.write(`${args.map((item) => (item instanceof Error ? item.stack || item.message : String(item))).join(' ')}\n`)
}

async function httpJson(path, init = undefined) {
  const response = await fetch(`${BRIDGE_BASE_URL}${path}`, {
    ...init,
    headers: createAgentBridgeAuthHeaders(bridgeRuntime.token, init?.headers ?? {}),
  })
  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { ok: false, code: 'invalid-json', message: text || 'invalid json response' }
  }
  return { response, data }
}

async function bridgeGet(path) {
  const { response, data } = await httpJson(path)
  return {
    ok: response.ok && data?.ok !== false,
    status: response.status,
    data,
  }
}

function splitCommandArgs(args = {}) {
  const { timeoutMs, waitForRelay, ...payload } = args ?? {}
  return {
    timeoutMs,
    waitForRelay,
    payload: Object.keys(payload).length > 0 ? payload : undefined,
  }
}

async function commandCall(command, args = {}) {
  const { timeoutMs, waitForRelay, payload } = splitCommandArgs(args)
  const { response, data } = await httpJson('/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, payload, timeoutMs, waitForRelay }),
  })
  return {
    ok: response.ok && data?.ok !== false,
    status: response.status,
    command,
    data,
  }
}

async function batchCall(args = {}) {
  const { commands, stopOnError, waitForRelay } = args ?? {}
  const { response, data } = await httpJson('/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands, stopOnError, waitForRelay }),
  })
  return {
    ok: response.ok && data?.ok !== false,
    status: response.status,
    data,
  }
}

function normalizeTypes(types) {
  if (!Array.isArray(types) || types.length === 0) {
    return ''
  }
  return types.map((item) => String(item).trim()).filter(Boolean).join(',')
}

async function openEventStream(types, timeoutMs = 10_000) {
  const controller = new AbortController()
  const url = new URL(`${BRIDGE_BASE_URL}/agent-events`)
  const normalized = normalizeTypes(types)
  if (normalized) {
    url.searchParams.set('types', normalized)
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const response = await fetch(url, {
    headers: createAgentBridgeAuthHeaders(bridgeRuntime.token, { Accept: 'text/event-stream' }),
    signal: controller.signal,
  })

  if (!response.ok || !response.body) {
    clearTimeout(timeout)
    controller.abort()
    throw new Error(`无法连接 agent-events: HTTP ${response.status}`)
  }

  return { response, controller, timeout, reader: response.body.getReader() }
}

async function readSseEvent(reader, controller) {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      return null
    }

    buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')

    while (buffer.includes('\n\n')) {
      const delimiterIndex = buffer.indexOf('\n\n')
      const rawEvent = buffer.slice(0, delimiterIndex)
      buffer = buffer.slice(delimiterIndex + 2)

      let eventName = 'message'
      const dataLines = []
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim()
          continue
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim())
        }
      }

      if (dataLines.length === 0) {
        continue
      }

      let data
      try {
        data = JSON.parse(dataLines.join('\n'))
      } catch {
        data = dataLines.join('\n')
      }

      return { event: eventName, data, controller }
    }
  }
}

async function readRecentEvents(args = {}) {
  const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : 10_000
  const stream = await openEventStream(args.types, timeoutMs)

  try {
    const first = await readSseEvent(stream.reader, stream.controller)
    if (!first) {
      return { ok: false, code: 'events-history-unavailable', message: '未收到 history 事件' }
    }
    return {
      ok: true,
      bridge: BRIDGE_BASE_URL,
      ...first,
    }
  } finally {
    clearTimeout(stream.timeout)
    stream.controller.abort()
  }
}

async function waitForNextEvent(args = {}) {
  const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : 30_000
  const stream = await openEventStream(args.types, timeoutMs)

  try {
    while (true) {
      const next = await readSseEvent(stream.reader, stream.controller)
      if (!next) {
        return { ok: false, code: 'event-stream-closed', message: '事件流已关闭' }
      }
      if (next.event === 'agent-event') {
        return {
          ok: true,
          bridge: BRIDGE_BASE_URL,
          ...next,
        }
      }
    }
  } catch (error) {
    if (stream.controller.signal.aborted) {
      return { ok: false, code: 'event-timeout', message: '等待事件超时' }
    }
    throw error
  } finally {
    clearTimeout(stream.timeout)
    stream.controller.abort()
  }
}

async function handleResourceRead(params, id) {
  const uri = typeof params?.uri === 'string' ? params.uri : ''
  if (!uri) {
    sendError(id, -32602, 'Missing resource uri')
    return
  }

  const resource = resourceMap.get(uri)
  if (!resource) {
    sendError(id, -32602, `Unknown resource: ${uri}`)
    return
  }

  try {
    const content = await resource.read()
    sendResult(id, { contents: [content] })
  } catch (error) {
    sendError(id, -32603, toErrorMessage(error), { resource: uri })
  }
}

async function handlePromptGet(params, id) {
  const name = typeof params?.name === 'string' ? params.name : ''
  if (!name) {
    sendError(id, -32602, 'Missing prompt name')
    return
  }

  const prompt = promptMap.get(name)
  if (!prompt) {
    sendError(id, -32602, `Unknown prompt: ${name}`)
    return
  }

  try {
    const result = await prompt.handler(params?.arguments ?? {})
    sendResult(id, result)
  } catch (error) {
    sendError(id, -32603, toErrorMessage(error), { prompt: name })
  }
}

function makeToolResult(payload, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
    isError,
  }
}

async function handleToolCall(params, id) {
  const { name, arguments: args } = params ?? {}
  if (!name || typeof name !== 'string') {
    sendError(id, -32602, 'Missing tool name')
    return
  }

  const tool = toolMap.get(name)
  if (!tool) {
    sendError(id, -32601, `Unknown tool: ${name}`)
    return
  }

  try {
    const result = await tool.handler(args ?? {})
    sendResult(id, makeToolResult(result, result?.ok === false))
  } catch (error) {
    const payload = {
      ok: false,
      code: 'mcp-tool-failed',
      message: error instanceof Error ? error.message : 'unknown error',
      bridge: BRIDGE_BASE_URL,
      tool: name,
    }
    sendResult(id, makeToolResult(payload, true))
  }
}

async function handleRequest(message) {
  const { id, method, params, jsonrpc } = message
  if (jsonrpc !== '2.0') {
    sendError(id, -32600, 'Invalid Request')
    return
  }

  switch (method) {
    case 'initialize':
      sendResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: {
          name: 'boss-helper-agent-mcp',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      })
      return
    case 'notifications/initialized':
      return
    case 'ping':
      sendResult(id, {})
      return
    case 'tools/list':
      sendResult(id, { tools: TOOL_DEFINITIONS.map(({ handler: _handler, ...tool }) => tool) })
      return
    case 'tools/call':
      await handleToolCall(params, id)
      return
    case 'resources/list':
      sendResult(id, { resources: RESOURCE_DEFINITIONS.map(({ read: _read, ...resource }) => resource) })
      return
    case 'resources/read':
      await handleResourceRead(params, id)
      return
    case 'prompts/list':
      sendResult(id, { prompts: PROMPT_DEFINITIONS.map(({ handler: _handler, ...prompt }) => prompt) })
      return
    case 'prompts/get':
      await handlePromptGet(params, id)
      return
    default:
      sendError(id, -32601, `Method not found: ${method}`)
  }
}

let buffer = Buffer.alloc(0)
let discardBytesRemaining = 0
let stdinQueue = Promise.resolve()

function discardBufferedBytes(bytes) {
  if (bytes <= 0) {
    return
  }

  const bufferedBytes = Math.min(bytes, buffer.length)
  buffer = buffer.slice(bufferedBytes)
  discardBytesRemaining = bytes - bufferedBytes
}

function rejectOversizedStdinFrame(messageStart, contentLength) {
  sendError(null, -32600, `Content-Length exceeds limit ${MAX_STDIN_CONTENT_LENGTH}`)
  discardBufferedBytes(messageStart + contentLength)
}

async function processBufferedMessages() {
  while (true) {
    const headerIndex = buffer.indexOf('\r\n\r\n')
    if (headerIndex === -1) {
      return
    }

    const headerText = buffer.slice(0, headerIndex).toString('utf8')
    const headers = headerText.split('\r\n')
    const lengthHeader = headers.find((line) => line.toLowerCase().startsWith('content-length:'))
    if (!lengthHeader) {
      sendError(null, -32600, 'Missing Content-Length header')
      buffer = Buffer.alloc(0)
      return
    }

    const contentLength = Number.parseInt(lengthHeader.split(':')[1].trim(), 10)
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      sendError(null, -32600, 'Invalid Content-Length header')
      buffer = Buffer.alloc(0)
      return
    }

    const messageStart = headerIndex + 4
    if (contentLength > MAX_STDIN_CONTENT_LENGTH) {
      rejectOversizedStdinFrame(messageStart, contentLength)
      if (discardBytesRemaining > 0) {
        return
      }
      continue
    }

    const messageEnd = messageStart + contentLength
    if (buffer.length < messageEnd) {
      return
    }

    const messageText = buffer.slice(messageStart, messageEnd).toString('utf8')
    buffer = buffer.slice(messageEnd)

    try {
      const message = JSON.parse(messageText)
      await handleRequest(message)
    } catch (error) {
      logError(error)
      sendError(null, -32700, 'Parse error')
    }
  }
}

async function processStdinChunk(chunk) {
  let nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)

  if (discardBytesRemaining > 0) {
    const discardFromChunk = Math.min(discardBytesRemaining, nextChunk.length)
    discardBytesRemaining -= discardFromChunk
    nextChunk = nextChunk.slice(discardFromChunk)
  }

  if (nextChunk.length === 0) {
    return
  }

  buffer = Buffer.concat([buffer, nextChunk])
  await processBufferedMessages()
}

stdin.on('data', (chunk) => {
  stdinQueue = stdinQueue
    .then(() => processStdinChunk(chunk))
    .catch((error) => {
      logError(error)
    })
})

stdin.on('error', (error) => {
  logError(error)
})

stdin.resume()
