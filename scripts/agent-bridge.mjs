// @ts-check

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AGENT_PROTOCOL_VERSION,
  resolveBossHelperAgentErrorMeta,
} from '../shared/agentProtocol.js'
import {
  createPrefixedLogger,
} from './shared/logging.mjs'
import {
  AGENT_BRIDGE_AUTH_HEADER,
  getAgentBridgeCertificate,
  getAgentBridgeEventPortName,
  getAgentBridgeRuntime,
} from './shared/security.mjs'

/** @typedef {import('node:net').Socket} NetSocket */
/** @typedef {import('node:tls').TLSSocket} TLSSocket */

const runtime = getAgentBridgeRuntime()
const logger = createPrefixedLogger('boss-helper-agent-bridge')
const HOST = runtime.host
const PORT = runtime.port
const HTTPS_PORT = runtime.httpsPort
const BRIDGE_TOKEN = runtime.token
const RELAY_SESSION_TOKEN = randomUUID()
const COMMAND_TIMEOUT_MS = Number.parseInt(process.env.BOSS_HELPER_AGENT_TIMEOUT ?? '30000', 10)
const MAX_JSON_BODY_BYTES = Number.parseInt(process.env.BOSS_HELPER_AGENT_MAX_BODY_BYTES ?? `${1024 * 1024}`, 10)
const relayFile = join(dirname(fileURLToPath(import.meta.url)), 'agent-relay.html')
const RELAY_SESSION_COOKIE = 'boss_helper_agent_relay_session'

const commandQueue = []
const pendingResponses = new Map()
const relayClients = new Set()
const relayMeta = new Map()
const eventClients = new Map()
const recentAgentEvents = []
const recentAgentEventIds = new Set()
let nextRelayIndex = 0
const trustedRelayOrigins = new Set([
  `https://127.0.0.1:${HTTPS_PORT}`,
  `https://localhost:${HTTPS_PORT}`,
])

/** @param {NetSocket} socket @returns {socket is TLSSocket} */
function isTlsSocket(socket) {
  return 'encrypted' in socket && socket.encrypted === true
}

function getCommandTimeoutMs(command, override) {
  if (Number.isFinite(override) && override > 0) {
    return override
  }

  switch (command) {
    case 'start':
    case 'jobs.list':
    case 'jobs.current':
    case 'jobs.refresh':
    case 'navigate':
    case 'chat.send':
      return 10_000
    case 'plan.preview':
      return 120_000
    case 'stop':
    case 'jobs.detail':
      return 65_000
    default:
      return COMMAND_TIMEOUT_MS
  }
}

function shouldWaitForRelay(command, value) {
  if (command === 'readiness.get') {
    return false
  }

  return value !== false
}

function createBridgeErrorResponse(code, message, extra = undefined) {
  return {
    ok: false,
    code,
    message,
    ...resolveBossHelperAgentErrorMeta(code),
    ...(extra ?? {}),
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

function setCorsHeaders(req, res) {
  const originHeader = req.headers.origin
  if (typeof originHeader !== 'string' || !trustedRelayOrigins.has(originHeader)) {
    return false
  }

  res.setHeader('Access-Control-Allow-Origin', originHeader)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', `Content-Type,${AGENT_BRIDGE_AUTH_HEADER}`)
  return true
}

function getRequestToken(req) {
  const authHeader = req.headers[AGENT_BRIDGE_AUTH_HEADER]
  if (typeof authHeader === 'string' && authHeader.trim()) {
    return authHeader.trim()
  }
  return ''
}

function parseCookieHeader(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return new Map()
  }

  const cookies = new Map()
  for (const item of value.split(';')) {
    const [name, ...rest] = item.split('=')
    const key = name?.trim()
    if (!key) {
      continue
    }
    cookies.set(key, rest.join('=').trim())
  }
  return cookies
}

function getRelaySessionToken(req) {
  return parseCookieHeader(req.headers.cookie).get(RELAY_SESSION_COOKIE) ?? ''
}

function isRelaySessionRequest(req) {
  return getRelaySessionToken(req) === RELAY_SESSION_TOKEN
}

function isAuthorizedRequest(req) {
  return getRequestToken(req) === BRIDGE_TOKEN || isRelaySessionRequest(req)
}

function setRelaySessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${RELAY_SESSION_COOKIE}=${RELAY_SESSION_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  )
}

function shouldSkipAuth(req, url) {
  return req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')
}

function getRelayPageHtml(relayHtml) {
  return relayHtml.replaceAll('__BOSS_HELPER_AGENT_BRIDGE_BASE_URL__', runtime.httpsBaseUrl)
}

function getRelayBootstrapPayload() {
  return {
    eventPortName: getAgentBridgeEventPortName(BRIDGE_TOKEN),
  }
}

function sendJson(req, res, statusCode, body) {
  setCorsHeaders(req, res)
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function sendHtml(req, res, html) {
  setCorsHeaders(req, res)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

function sendSse(req, res) {
  setCorsHeaders(req, res)
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
  const contentLengthHeader = req.headers['content-length']
  const contentLength = Number.parseInt(Array.isArray(contentLengthHeader) ? contentLengthHeader[0] : contentLengthHeader ?? '', 10)

  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    const error = new Error('请求体过大')
    error.name = 'BridgeBodyTooLargeError'
    throw error
  }

  const chunks = []
  let totalBytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      const error = new Error('请求体过大')
      error.name = 'BridgeBodyTooLargeError'
      throw error
    }
    chunks.push(buffer)
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
    const relay = relays[nextRelayIndex % relays.length]
    nextRelayIndex = (nextRelayIndex + 1) % relays.length
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
      version: AGENT_PROTOCOL_VERSION,
      ...command,
      requestId,
    },
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingResponses.delete(requestId)
      resolve(createBridgeErrorResponse('bridge-timeout', 'relay 页面未在超时时间内返回结果'))
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
  if (relayClients.size === 0) {
    nextRelayIndex = 0
  } else {
    nextRelayIndex %= relayClients.size
  }
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
  const relayPageHtml = getRelayPageHtml(relayHtml)

  return createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendJson(req, res, 400, { ok: false, message: 'missing url' })
        return
      }

      const secureRequest = isTlsSocket(req.socket)
      const protocol = secureRequest ? 'https' : 'http'
      const fallbackPort = secureRequest ? HTTPS_PORT : PORT
      const url = new URL(req.url, `${protocol}://${req.headers.host ?? `${HOST}:${fallbackPort}`}`)

      if (req.method === 'OPTIONS') {
        const allowed = setCorsHeaders(req, res)
        res.writeHead(allowed ? 204 : 403)
        res.end()
        return
      }

      if (!secureRequest && req.method === 'GET' && url.pathname === '/') {
        res.writeHead(307, { Location: `${runtime.httpsBaseUrl}/` })
        res.end()
        return
      }

      if (!shouldSkipAuth(req, url) && !isAuthorizedRequest(req)) {
        sendJson(
          req,
          res,
          401,
          createBridgeErrorResponse('unauthorized-bridge-token', '缺少或错误的 bridge token'),
        )
        return
      }

      if (req.method === 'GET' && url.pathname === '/') {
        if (secureRequest) {
          setRelaySessionCookie(res)
        }
        sendHtml(req, res, relayPageHtml)
        return
      }

      if (req.method === 'GET' && url.pathname === '/relay/bootstrap') {
        if (!secureRequest) {
          sendJson(
            req,
            res,
            400,
            createBridgeErrorResponse('relay-bootstrap-requires-https', 'relay bootstrap 仅支持 HTTPS'),
          )
          return
        }

        sendJson(req, res, 200, {
          ok: true,
          ...getRelayBootstrapPayload(),
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(req, res, 200, {
          ok: true,
          host: HOST,
          port: PORT,
          httpsPort: HTTPS_PORT,
          relayConnected: relayClients.size > 0,
          eventSubscribers: eventClients.size,
          queued: commandQueue.length,
          pendingResponses: pendingResponses.size,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/status') {
        sendJson(req, res, 200, {
          ok: true,
          relayConnected: relayClients.size > 0,
          eventSubscribers: eventClients.size,
          recentEventCount: recentAgentEvents.length,
          relays: getRelaySnapshot(),
          queued: commandQueue.length,
          pendingResponses: pendingResponses.size,
          bridgeBaseUrl: runtime.httpsBaseUrl,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/events') {
        const clientId = normalizeRelayClientId(url.searchParams.get('clientId'))
        sendSse(req, res)
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
        sendSse(req, res)
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
        sendJson(req, res, 200, {
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
        sendJson(req, res, resolved ? 200 : 404, {
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
          sendJson(req, res, 400, createBridgeErrorResponse('invalid-agent-event', '缺少 event 数据'))
          return
        }

        if (!rememberAgentEvent(event)) {
          sendJson(req, res, 202, {
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

        sendJson(req, res, 200, {
          ok: true,
          accepted: true,
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/command') {
        const body = await readJson(req)
        if (!body.command || typeof body.command !== 'string') {
          sendJson(req, res, 400, createBridgeErrorResponse('invalid-command', '缺少 command 字段'))
          return
        }

        const waitForRelay = shouldWaitForRelay(body.command, body.waitForRelay)

        if (relayClients.size === 0 && !waitForRelay) {
          sendJson(
            req,
            res,
            503,
            createBridgeErrorResponse(
              'relay-not-connected',
              '没有已连接的 relay 页面，请先打开 companion 页面并连接扩展',
            ),
          )
          return
        }

        const response = await queueCommand(
          {
            command: body.command,
            payload: body.payload,
          },
          getCommandTimeoutMs(body.command, body.timeoutMs),
        )

        sendJson(req, res, 200, response)
        return
      }

      if (req.method === 'POST' && url.pathname === '/batch') {
        const body = await readJson(req)
        const waitForRelay = body.waitForRelay !== false

        if (relayClients.size === 0 && !waitForRelay) {
          sendJson(
            req,
            res,
            503,
            createBridgeErrorResponse(
              'relay-not-connected',
              '没有已连接的 relay 页面，请先打开 companion 页面并连接扩展',
            ),
          )
          return
        }

        if (!Array.isArray(body.commands) || body.commands.length === 0) {
          sendJson(
            req,
            res,
            400,
            createBridgeErrorResponse('invalid-batch-commands', 'commands 必须是非空数组'),
          )
          return
        }

        if (body.commands.some((command) => !command?.command || typeof command.command !== 'string')) {
          sendJson(
            req,
            res,
            400,
            createBridgeErrorResponse(
              'invalid-batch-command-item',
              'commands 中的每一项都必须包含 command 字段',
            ),
          )
          return
        }

        const response = await runBatchCommands(body.commands, {
          stopOnError: body.stopOnError,
        })

        sendJson(req, res, 200, response)
        return
      }

      sendJson(req, res, 404, { ok: false, message: 'not found' })
    } catch (error) {
      if (error instanceof Error && error.name === 'BridgeBodyTooLargeError') {
        sendJson(
          req,
          res,
          413,
          createBridgeErrorResponse(
            'request-body-too-large',
            `请求体超过限制（${MAX_JSON_BODY_BYTES} bytes）`,
          ),
        )
        return
      }

      sendJson(
        req,
        res,
        500,
        createBridgeErrorResponse(
          'bridge-server-error',
          error instanceof Error ? error.message : 'unknown error',
        ),
      )
    }
  })
}

const server = await createAppServer()
const certificate = await getAgentBridgeCertificate()
const serverRequestListener = /** @type {import('node:http').RequestListener} */ (server.listeners('request')[0])
const httpsServer = createHttpsServer(
  {
    cert: certificate.cert,
    key: certificate.key,
  },
  serverRequestListener,
)

server.listen(PORT, HOST, () => {
  logger.log(`listening on http://${HOST}:${PORT}`)
  logger.log(`open https://${HOST}:${HTTPS_PORT}/ in a Chromium browser and connect the extension relay`)
  logger.log(`authenticate API clients with header ${AGENT_BRIDGE_AUTH_HEADER}`)
})

httpsServer.listen(HTTPS_PORT, HOST, () => {
  logger.log(`listening on https://${HOST}:${HTTPS_PORT}`)
})
