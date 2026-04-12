// @ts-check

import { Buffer } from 'node:buffer'
import { env as processEnv, stderr as processStderr, stdin as processStdin, stdout as processStdout } from 'node:process'

import { stringifyError } from '../shared/logging.mjs'
import { createBridgeClient } from './bridge-client.mjs'
import { createMcpCatalog } from './catalog.mjs'
import { createMcpRequestHandler } from './handlers.mjs'

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   stderr?: NodeJS.WriteStream,
 *   stdin?: NodeJS.ReadStream,
 *   stdout?: NodeJS.WriteStream,
 * }} [options]
 */
export function runMcpServer(options = {}) {
  const env = options.env ?? processEnv
  const stdin = options.stdin ?? processStdin
  const stdout = options.stdout ?? processStdout
  const stderr = options.stderr ?? processStderr
  const maxStdinContentLength = Number.parseInt(
    env.BOSS_HELPER_AGENT_MCP_MAX_CONTENT_LENGTH ?? `${1024 * 1024}`,
    10,
  )

  const bridgeClient = createBridgeClient(env)
  const catalog = createMcpCatalog(bridgeClient)

  let transportMode = 'content-length'

  function writeMessage(message) {
    const json = JSON.stringify(message)
    if (transportMode === 'json-line') {
      stdout.write(`${json}\n`)
      return
    }

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
    stderr.write(`${args.map((item) => stringifyError(item)).join(' ')}\n`)
  }

  const handleRequest = createMcpRequestHandler({
    bridgeBaseUrl: bridgeClient.baseUrl,
    catalog,
    sendError,
    sendResult,
  })

  let buffer = Buffer.alloc(0)
  let discardBytesRemaining = 0
  let stdinQueue = Promise.resolve()

  function findHeaderBoundary() {
    const crlfIndex = buffer.indexOf('\r\n\r\n')
    const lfIndex = buffer.indexOf('\n\n')

    if (crlfIndex === -1) {
      return lfIndex === -1 ? null : { headerIndex: lfIndex, separatorLength: 2 }
    }

    if (lfIndex === -1 || crlfIndex < lfIndex) {
      return { headerIndex: crlfIndex, separatorLength: 4 }
    }

    return { headerIndex: lfIndex, separatorLength: 2 }
  }

  function startsWithContentLengthHeader() {
    return buffer.subarray(0, 15).toString('utf8').toLowerCase() === 'content-length:'
  }

  async function processJsonLineMessage(newlineIndex) {
    const line = buffer.slice(0, newlineIndex).toString('utf8').replace(/\r$/, '')
    buffer = buffer.slice(newlineIndex + 1)

    if (!line.trim()) {
      return true
    }

    try {
      transportMode = 'json-line'
      const message = JSON.parse(line)
      await handleRequest(message)
    } catch (error) {
      logError(error)
      sendError(null, -32700, 'Parse error')
    }

    return true
  }

  function discardBufferedBytes(bytes) {
    if (bytes <= 0) {
      return
    }

    const bufferedBytes = Math.min(bytes, buffer.length)
    buffer = buffer.slice(bufferedBytes)
    discardBytesRemaining = bytes - bufferedBytes
  }

  function rejectOversizedStdinFrame(messageStart, contentLength) {
    sendError(null, -32600, `Content-Length exceeds limit ${maxStdinContentLength}`)
    discardBufferedBytes(messageStart + contentLength)
  }

  async function processBufferedMessages() {
    while (true) {
      const headerBoundary = findHeaderBoundary()
      if (!headerBoundary) {
        if (startsWithContentLengthHeader()) {
          return
        }

        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex === -1) {
          return
        }

        await processJsonLineMessage(newlineIndex)
        continue
      }

      const { headerIndex, separatorLength } = headerBoundary

      const headerText = buffer.slice(0, headerIndex).toString('utf8')
      const headers = headerText.split(/\r?\n/)
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

      const messageStart = headerIndex + separatorLength
      if (contentLength > maxStdinContentLength) {
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
        transportMode = 'content-length'
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
}
