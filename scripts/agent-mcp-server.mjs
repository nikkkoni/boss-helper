#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { stdin, stdout, stderr, env } from 'node:process'

import {
  createAgentBridgeAuthHeaders,
  getAgentBridgeRuntime,
} from './agent-security.mjs'

const bridgeRuntime = getAgentBridgeRuntime(env)
const BRIDGE_BASE_URL = bridgeRuntime.httpBaseUrl
const MCP_PROTOCOL_VERSION = '2024-11-05'

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
          items: { type: 'string', enum: ['pending', 'wait', 'running', 'success', 'error', 'warn'] },
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

function writeMessage(message) {
  const json = JSON.stringify(message)
  const payload = Buffer.from(json, 'utf8')
  stdout.write(`Content-Length: ${payload.length}\r\n\r\n`)
  stdout.write(payload)
}

function sendResult(id, result) {
  if (id == null) return
  writeMessage({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message, data = undefined) {
  if (id == null) return
  writeMessage({
    jsonrpc: '2.0',
    id,
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
      sendResult(id, { resources: [] })
      return
    case 'prompts/list':
      sendResult(id, { prompts: [] })
      return
    default:
      sendError(id, -32601, `Method not found: ${method}`)
  }
}

let buffer = Buffer.alloc(0)

stdin.on('data', async (chunk) => {
  buffer = Buffer.concat([buffer, chunk])

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
    const messageStart = headerIndex + 4
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
})

stdin.on('error', (error) => {
  logError(error)
})

stdin.resume()
