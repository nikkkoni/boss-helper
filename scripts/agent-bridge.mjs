import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = process.env.BOSS_HELPER_AGENT_HOST ?? '127.0.0.1'
const PORT = Number.parseInt(process.env.BOSS_HELPER_AGENT_PORT ?? '4317', 10)
const COMMAND_TIMEOUT_MS = Number.parseInt(process.env.BOSS_HELPER_AGENT_TIMEOUT ?? '30000', 10)
const relayFile = join(dirname(fileURLToPath(import.meta.url)), 'agent-relay.html')

const commandQueue = []
const pendingResponses = new Map()
const relayClients = new Set()
const relayMeta = new Map()
const eventClients = new Map()
const recentAgentEvents = []
const recentAgentEventIds = new Set()

function getCommandTimeoutMs(command, override) {
  if (Number.isFinite(override) && override > 0) {
    return override
  }

  switch (command) {
    case 'start':
    case 'jobs.list':
    case 'navigate':
    case 'chat.send':
      return 10_000
    case 'stop':
    case 'jobs.detail':
      return 65_000
    default:
      return COMMAND_TIMEOUT_MS
  }
}

function rememberAgentEvent(event) {
  if (typeof event?.id !== 'string' || recentAgentEventIds.has(event.id)) {
    return false
  }

  recentAgentEventIds.add(event.id)
  recentAgentEvents.push(event)

  if (recentAgentEvents.length > 100) {
    const expired = recentAgentEvents.shift()
    if (expired?.id) {
      recentAgentEventIds.delete(expired.id)
    }
  }

  return true
}

function normalizeRelayClientId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : randomUUID()
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res, statusCode, body) {
  setCorsHeaders(res)
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function sendHtml(res, html) {
  setCorsHeaders(res)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

function sendSse(res) {
  setCorsHeaders(res)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  res.write(': connected\n\n')
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function getRelaySnapshot() {
  return [...relayClients].map((res) => {
    const meta = relayMeta.get(res) ?? {}
    return {
      clientId: meta.clientId ?? '',
      connectedAt: meta.connectedAt ?? null,
      extensionId: meta.extensionId ?? '',
      lastSeenAt: meta.lastSeenAt ?? null,
      userAgent: meta.userAgent ?? '',
    }
  })
}

function normalizeEventTypeFilter(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const filter = new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )

  return filter.size > 0 ? filter : null
}

function matchesEventTypeFilter(event, filter) {
  if (filter == null) {
    return true
  }
  return typeof event?.type === 'string' && filter.has(event.type)
}

function getFilteredEventSnapshot(filter) {
  return {
    subscribers: eventClients.size,
    recent: recentAgentEvents.filter((event) => matchesEventTypeFilter(event, filter)).slice(-20),
  }
}

function broadcastQueueState() {
  const relays = [...relayClients]
  if (relays.length === 0) {
    return
  }

  const payload = {
    queued: commandQueue.length,
    pendingResponses: pendingResponses.size,
    relays: getRelaySnapshot(),
  }

  relays.forEach((relay) => writeSse(relay, 'status', payload))
}

function dispatchQueuedCommands() {
  const relays = [...relayClients]
  if (relays.length === 0 || commandQueue.length === 0) {
    return
  }

  while (commandQueue.length > 0) {
    const relay = relays[0]
    const command = commandQueue.shift()
    writeSse(relay, 'command', command)
  }

  broadcastQueueState()
}

function enqueueCommand(request) {
  commandQueue.push(request)
  dispatchQueuedCommands()
}

function clearPendingResponse(requestId, response) {
  const pending = pendingResponses.get(requestId)
  if (!pending) {
    return false
  }

  clearTimeout(pending.timeout)
  pendingResponses.delete(requestId)
  pending.resolve(response)
  broadcastQueueState()
  return true
}

function queueCommand(command, timeoutMs = COMMAND_TIMEOUT_MS) {
  const requestId = command.requestId ?? randomUUID()
  const request = {
    requestId,
    request: {
      channel: '__boss_helper_agent__',
      version: 1,
      ...command,
      requestId,
    },
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingResponses.delete(requestId)
      resolve({
        ok: false,
        code: 'bridge-timeout',
        message: 'relay 页面未在超时时间内返回结果',
      })
      broadcastQueueState()
    }, timeoutMs)

    pendingResponses.set(requestId, { resolve, timeout })
    enqueueCommand(request)
    broadcastQueueState()
  })
}

async function runBatchCommands(commands, options = {}) {
  const stopOnError = Boolean(options.stopOnError)
  const results = []

  for (const command of commands) {
    const response = await queueCommand(
      {
        command: command.command,
        payload: command.payload,
      },
      getCommandTimeoutMs(command.command, command.timeoutMs),
    )

    results.push({
      command: command.command,
      response,
    })

    if (stopOnError && response?.ok === false) {
      return {
        ok: false,
        stoppedOnError: true,
        results,
      }
    }
  }

  return {
    ok: results.every((item) => item.response?.ok !== false),
    stoppedOnError: false,
    results,
  }
}

function handleRelayDisconnect(res) {
  relayClients.delete(res)
  relayMeta.delete(res)
  broadcastQueueState()
}

function handleEventClientDisconnect(res) {
  eventClients.delete(res)
}

function updateRelayMeta(clientId, patch) {
  for (const relay of relayClients) {
    const meta = relayMeta.get(relay)
    if (!meta || meta.clientId !== clientId) {
      continue
    }

    relayMeta.set(relay, {
      ...meta,
      ...patch,
      lastSeenAt: new Date().toISOString(),
    })
  }
}

async function createAppServer() {
  const relayHtml = await readFile(relayFile, 'utf8')

  return createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendJson(res, 400, { ok: false, message: 'missing url' })
        return
      }

      const url = new URL(req.url, `http://${req.headers.host ?? `${HOST}:${PORT}`}`)

      if (req.method === 'OPTIONS') {
        setCorsHeaders(res)
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method === 'GET' && url.pathname === '/') {
        sendHtml(res, relayHtml)
        return
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          host: HOST,
          port: PORT,
          relayConnected: relayClients.size > 0,
          eventSubscribers: eventClients.size,
          queued: commandQueue.length,
          pendingResponses: pendingResponses.size,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/status') {
        sendJson(res, 200, {
          ok: true,
          relayConnected: relayClients.size > 0,
          eventSubscribers: eventClients.size,
          recentEventCount: recentAgentEvents.length,
          relays: getRelaySnapshot(),
          queued: commandQueue.length,
          pendingResponses: pendingResponses.size,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/events') {
        const clientId = normalizeRelayClientId(url.searchParams.get('clientId'))
        sendSse(res)
        relayClients.add(res)
        relayMeta.set(res, {
          clientId,
          connectedAt: new Date().toISOString(),
          extensionId: url.searchParams.get('extensionId') ?? '',
          lastSeenAt: new Date().toISOString(),
          userAgent: req.headers['user-agent'] ?? '',
        })
        req.on('close', () => handleRelayDisconnect(res))
        writeSse(res, 'status', {
          queued: commandQueue.length,
          pendingResponses: pendingResponses.size,
          relays: getRelaySnapshot(),
        })
        dispatchQueuedCommands()
        return
      }

      if (req.method === 'GET' && url.pathname === '/agent-events') {
        const typeFilter = normalizeEventTypeFilter(url.searchParams.get('types'))
        sendSse(res)
        eventClients.set(res, { typeFilter })
        req.on('close', () => handleEventClientDisconnect(res))
        writeSse(res, 'history', getFilteredEventSnapshot(typeFilter))
        return
      }

      if (req.method === 'POST' && url.pathname === '/relay/announce') {
        const body = await readJson(req)
        const clientId = normalizeRelayClientId(body.clientId)
        updateRelayMeta(clientId, {
          extensionId: body.extensionId ?? '',
          browser: body.browser ?? '',
          userAgent: body.browser ?? '',
        })
        broadcastQueueState()
        sendJson(res, 200, {
          ok: true,
          relay: {
            clientId,
            extensionId: body.extensionId ?? '',
            browser: body.browser ?? '',
          },
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/responses') {
        const body = await readJson(req)
        const resolved = clearPendingResponse(body.requestId, body.response)
        sendJson(res, resolved ? 200 : 404, {
          ok: resolved,
          requestId: body.requestId,
          message: resolved ? 'response accepted' : 'request not found',
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/agent-events') {
        const body = await readJson(req)
        const event = body?.event ?? body

        if (!event || typeof event !== 'object') {
          sendJson(res, 400, {
            ok: false,
            code: 'invalid-agent-event',
            message: '缺少 event 数据',
          })
          return
        }

        if (!rememberAgentEvent(event)) {
          sendJson(res, 202, {
            ok: true,
            accepted: false,
            reason: 'duplicate-event',
          })
          return
        }

        for (const [client, metadata] of eventClients) {
          if (!matchesEventTypeFilter(event, metadata?.typeFilter ?? null)) {
            continue
          }
          writeSse(client, 'agent-event', event)
        }

        sendJson(res, 200, {
          ok: true,
          accepted: true,
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/command') {
        const body = await readJson(req)
        const waitForRelay = body.waitForRelay !== false

        if (relayClients.size === 0 && !waitForRelay) {
          sendJson(res, 503, {
            ok: false,
            code: 'relay-not-connected',
            message: '没有已连接的 relay 页面，请先打开 companion 页面并连接扩展',
          })
          return
        }

        if (!body.command || typeof body.command !== 'string') {
          sendJson(res, 400, {
            ok: false,
            code: 'invalid-command',
            message: '缺少 command 字段',
          })
          return
        }

        const response = await queueCommand(
          {
            command: body.command,
            payload: body.payload,
          },
          getCommandTimeoutMs(body.command, body.timeoutMs),
        )

        sendJson(res, 200, response)
        return
      }

      if (req.method === 'POST' && url.pathname === '/batch') {
        const body = await readJson(req)
        const waitForRelay = body.waitForRelay !== false

        if (relayClients.size === 0 && !waitForRelay) {
          sendJson(res, 503, {
            ok: false,
            code: 'relay-not-connected',
            message: '没有已连接的 relay 页面，请先打开 companion 页面并连接扩展',
          })
          return
        }

        if (!Array.isArray(body.commands) || body.commands.length === 0) {
          sendJson(res, 400, {
            ok: false,
            code: 'invalid-batch-commands',
            message: 'commands 必须是非空数组',
          })
          return
        }

        if (body.commands.some((command) => !command?.command || typeof command.command !== 'string')) {
          sendJson(res, 400, {
            ok: false,
            code: 'invalid-batch-command-item',
            message: 'commands 中的每一项都必须包含 command 字段',
          })
          return
        }

        const response = await runBatchCommands(body.commands, {
          stopOnError: body.stopOnError,
        })

        sendJson(res, 200, response)
        return
      }

      sendJson(res, 404, { ok: false, message: 'not found' })
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        code: 'bridge-server-error',
        message: error instanceof Error ? error.message : 'unknown error',
      })
    }
  })
}

const server = await createAppServer()

server.listen(PORT, HOST, () => {
  console.log(`[boss-helper-agent-bridge] listening on http://${HOST}:${PORT}`)
  console.log(`[boss-helper-agent-bridge] open http://${HOST}:${PORT}/ in a Chromium browser and connect the extension relay`)
})