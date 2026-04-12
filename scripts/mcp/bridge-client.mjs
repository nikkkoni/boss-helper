// @ts-check

import { createAgentBridgeAuthHeaders, getAgentBridgeRuntime } from '../shared/security.mjs'
import { resolveBossHelperAgentErrorMeta } from '../shared/protocol.mjs'

function normalizeTypes(types) {
  if (!Array.isArray(types) || types.length === 0) {
    return ''
  }

  return types.map((item) => String(item).trim()).filter(Boolean).join(',')
}

function splitCommandArgs(args = {}) {
  const { timeoutMs, waitForRelay, ...payload } = args ?? {}
  return {
    timeoutMs,
    waitForRelay,
    payload: Object.keys(payload).length > 0 ? payload : undefined,
  }
}

function createBridgeClientError(code, message, extra = undefined) {
  return {
    ok: false,
    code,
    message,
    ...resolveBossHelperAgentErrorMeta(code),
    ...(extra ?? {}),
  }
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

/** @param {NodeJS.ProcessEnv} [env] */
export function createBridgeClient(env = process.env) {
  const bridgeRuntime = getAgentBridgeRuntime(env)
  const baseUrl = bridgeRuntime.httpBaseUrl

  async function httpJson(path, init = undefined) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: createAgentBridgeAuthHeaders(bridgeRuntime.token, init?.headers ?? {}),
      })
      const text = await response.text()
      let data
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = createBridgeClientError('invalid-json', text || 'invalid json response')
      }
      return { response, data }
    } catch (error) {
      return {
        response: undefined,
        data: createBridgeClientError(
          'bridge-request-failed',
          error instanceof Error ? error.message : 'bridge request failed',
        ),
      }
    }
  }

  async function bridgeGet(path) {
    const { response, data } = await httpJson(path)
    return {
      ok: response?.ok === true && data?.ok !== false,
      status: response?.status,
      data,
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
      ok: response?.ok === true && data?.ok !== false,
      status: response?.status,
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
      ok: response?.ok === true && data?.ok !== false,
      status: response?.status,
      data,
    }
  }

  async function openEventStream(types, timeoutMs = 10_000) {
    const controller = new AbortController()
    const url = new URL(`${baseUrl}/agent-events`)
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

  async function readRecentEvents(args = {}) {
    const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : 10_000
    let stream

    try {
      stream = await openEventStream(args.types, timeoutMs)
    } catch (error) {
      return createBridgeClientError(
        'event-request-failed',
        error instanceof Error ? error.message : '无法连接事件流',
      )
    }

    try {
      const first = await readSseEvent(stream.reader, stream.controller)
      if (!first) {
        return createBridgeClientError('events-history-unavailable', '未收到 history 事件')
      }
      return {
        ok: true,
        bridge: baseUrl,
        ...first,
      }
    } finally {
      clearTimeout(stream.timeout)
      stream.controller.abort()
    }
  }

  async function waitForNextEvent(args = {}) {
    const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : 30_000
    let stream

    try {
      stream = await openEventStream(args.types, timeoutMs)
    } catch (error) {
      return createBridgeClientError(
        'event-request-failed',
        error instanceof Error ? error.message : '无法连接事件流',
      )
    }

    try {
      while (true) {
        const next = await readSseEvent(stream.reader, stream.controller)
        if (!next) {
          return createBridgeClientError('event-stream-closed', '事件流已关闭')
        }
        if (next.event === 'agent-event') {
          return {
            ok: true,
            bridge: baseUrl,
            ...next,
          }
        }
      }
    } catch (error) {
      if (stream.controller.signal.aborted) {
        return createBridgeClientError('event-timeout', '等待事件超时')
      }
      throw error
    } finally {
      clearTimeout(stream.timeout)
      stream.controller.abort()
    }
  }

  return {
    baseUrl,
    bridgeRuntime,
    batchCall,
    bridgeGet,
    commandCall,
    httpJson,
    readRecentEvents,
    waitForNextEvent,
  }
}