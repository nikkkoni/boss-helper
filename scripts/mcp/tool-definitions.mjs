// @ts-check

import { AGENT_CONTEXT_SECTIONS, JOB_STATUS_FILTERS } from '../shared/protocol.mjs'

/** @typedef {import('../types.d.ts').McpToolDefinition} McpToolDefinition */

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

/**
 * @param {{
 *   bridgeClient: ReturnType<import('./bridge-client.mjs').createBridgeClient>,
 *   contextService: ReturnType<import('./context.mjs').createAgentContextService>,
 * }} services
 * @returns {McpToolDefinition[]}
 */
export function createToolDefinitions({ bridgeClient, contextService }) {
  const { batchCall, bridgeGet, commandCall, readRecentEvents, waitForNextEvent } = bridgeClient
  const { readAgentContext, readBootstrapGuide } = contextService

  return [
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
      name: 'boss_helper_bootstrap_guide',
      description: '只读检查自举前置条件，明确还缺哪一步以及下一步应由谁执行。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: () => readBootstrapGuide(),
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
      name: 'boss_helper_plan_preview',
      description: '在不触发真实 start 的前提下，预演当前页面岗位会如何被处理。',
      inputSchema: {
        type: 'object',
        properties: {
          jobIds: { type: 'array', items: { type: 'string' } },
          configPatch: { type: 'object' },
          resetFiltered: { type: 'boolean' },
          timeoutMs: { type: 'number' },
          waitForRelay: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      handler: (args) => commandCall('plan.preview', args),
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
      name: 'boss_helper_jobs_refresh',
      description: '刷新当前受支持的 Boss 职位列表页，不改变现有搜索条件。',
      inputSchema: simpleCommandSchema(),
      handler: (args) => commandCall('jobs.refresh', args),
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
}