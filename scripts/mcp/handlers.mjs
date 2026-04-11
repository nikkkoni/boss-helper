// @ts-check

import { MCP_PROTOCOL_VERSION, MCP_SERVER_INFO } from '../shared/protocol.mjs'

function toErrorMessage(error) {
  return error instanceof Error ? error.message : 'unknown error'
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

/**
 * @param {{
 *   bridgeBaseUrl: string,
 *   catalog: ReturnType<import('./catalog.mjs').createMcpCatalog>,
 *   sendError: (id: number | string | null | undefined, code: number, message: string, data?: unknown) => void,
 *   sendResult: (id: number | string | null | undefined, result: unknown) => void,
 * }} options
 */
export function createMcpRequestHandler({ bridgeBaseUrl, catalog, sendError, sendResult }) {
  const { promptMap, prompts, resourceMap, resources, toolMap, tools } = catalog

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
        bridge: bridgeBaseUrl,
        tool: name,
      }
      sendResult(id, makeToolResult(payload, true))
    }
  }

  return async function handleRequest(message) {
    const { id, method, params, jsonrpc } = message
    if (jsonrpc !== '2.0') {
      sendError(id, -32600, 'Invalid Request')
      return
    }

    switch (method) {
      case 'initialize':
        sendResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: MCP_SERVER_INFO,
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
        sendResult(id, { tools: tools.map(({ handler: _handler, ...tool }) => tool) })
        return
      case 'tools/call':
        await handleToolCall(params, id)
        return
      case 'resources/list':
        sendResult(id, { resources: resources.map(({ read: _read, ...resource }) => resource) })
        return
      case 'resources/read':
        await handleResourceRead(params, id)
        return
      case 'prompts/list':
        sendResult(id, { prompts: prompts.map(({ handler: _handler, ...prompt }) => prompt) })
        return
      case 'prompts/get':
        await handlePromptGet(params, id)
        return
      default:
        sendError(id, -32601, `Method not found: ${method}`)
    }
  }
}