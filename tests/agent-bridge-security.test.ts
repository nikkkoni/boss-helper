import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = '/Users/wang/Documents/boss/boss-helper'

type BridgeProcess = {
  child: ChildProcessWithoutNullStreams
  cleanup: () => void
  getStderr: () => string
  getStdout: () => string
}

async function startBridge() {
  const port = 4600 + Math.floor(Math.random() * 200)
  const httpsPort = port + 1
  const token = `vitest-bridge-token-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const tokenDir = mkdtempSync(join(tmpdir(), 'boss-helper-agent-bridge-security-'))
  const tokenFile = join(tokenDir, '.boss-helper-agent-token')

  const child = spawn(process.execPath, ['./scripts/agent-bridge.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BOSS_HELPER_AGENT_BRIDGE_TOKEN: token,
      BOSS_HELPER_AGENT_HOST: '127.0.0.1',
      BOSS_HELPER_AGENT_PORT: String(port),
      BOSS_HELPER_AGENT_HTTPS_PORT: String(httpsPort),
      BOSS_HELPER_AGENT_MAX_BODY_BYTES: '128',
      BOSS_HELPER_AGENT_TOKEN_FILE: tokenFile,
    },
    stdio: 'pipe',
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8')
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })

  await waitForBridge(port)

  return {
    bridge: {
      child,
      cleanup: () => rmSync(tokenDir, { force: true, recursive: true }),
      getStderr: () => stderr,
      getStdout: () => stdout,
    } satisfies BridgeProcess,
    httpsPort,
    port,
    token,
  }
}

async function waitForBridge(port: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) {
        return
      }
    } catch {
      // keep polling until startup completes
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`bridge did not start on port ${port}`)
}

async function requestText(
  url: string,
  init: {
    body?: string
    headers?: Record<string, string>
    method?: string
  } = {},
) {
  const target = new URL(url)
  const requestImpl = target.protocol === 'https:' ? httpsRequest : httpRequest

  return new Promise<{
    body: string
    headers: Record<string, string | string[] | undefined>
    statusCode: number
  }>((resolve, reject) => {
    const req = requestImpl(
      target,
      {
        headers: init.headers,
        method: init.method,
        rejectUnauthorized: false,
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          resolve({
            body,
            headers: res.headers,
            statusCode: res.statusCode ?? 0,
          })
        })
      },
    )

    req.on('error', reject)

    if (init.body) {
      req.write(init.body)
    }

    req.end()
  })
}

async function stopBridge(bridge: BridgeProcess | null) {
  if (!bridge) {
    return
  }

  try {
    if (!bridge.child.killed && bridge.child.exitCode == null) {
      bridge.child.kill()
      await once(bridge.child, 'exit')
    }
  } finally {
    bridge.cleanup()
  }
}

let activeBridge: BridgeProcess | null = null

afterEach(async () => {
  await stopBridge(activeBridge)
  activeBridge = null
})

describe('agent bridge security', () => {
  it('limits CORS headers to trusted local HTTPS relay origins', async () => {
    const { bridge, httpsPort, port } = await startBridge()
    activeBridge = bridge

    const blockedCorsResponse = await requestText(`http://127.0.0.1:${port}/health`, {
      headers: {
        Origin: 'https://evil.example',
      },
    })

    expect(blockedCorsResponse.statusCode).toBe(200)
    expect(blockedCorsResponse.headers['access-control-allow-origin']).toBeUndefined()

    const allowedOrigin = `https://127.0.0.1:${httpsPort}`
    const allowedCorsResponse = await requestText(`${allowedOrigin}/health`, {
      headers: {
        Origin: allowedOrigin,
      },
    })

    expect(allowedCorsResponse.statusCode).toBe(200)
    expect(allowedCorsResponse.headers['access-control-allow-origin']).toBe(allowedOrigin)
    expect(allowedCorsResponse.headers.vary).toBe('Origin')
  })

  it('removes token leakage from relay HTML and rejects query token auth', async () => {
    const { bridge, httpsPort, token } = await startBridge()
    activeBridge = bridge

    const relayResponse = await requestText(`https://127.0.0.1:${httpsPort}/`)
    const relayHtml = relayResponse.body

    expect(relayResponse.statusCode).toBe(200)
    expect(relayHtml).toContain("/relay/bootstrap")
    expect(relayHtml).not.toContain(token)
    expect(relayHtml).not.toContain('__BOSS_HELPER_AGENT_BRIDGE_TOKEN__')

    const statusWithQueryToken = await requestText(
      `https://127.0.0.1:${httpsPort}/status?token=${encodeURIComponent(token)}`,
    )

    expect(statusWithQueryToken.statusCode).toBe(401)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(bridge.getStdout()).toContain('authenticate API clients with header x-boss-helper-agent-token')
    expect(bridge.getStdout()).not.toContain(token)
  })

  it('allows relay bootstrap via secure session cookie and rejects oversized JSON bodies', async () => {
    const { bridge, httpsPort, token } = await startBridge()
    activeBridge = bridge

    const relayResponse = await requestText(`https://127.0.0.1:${httpsPort}/`)
    const setCookieHeader = relayResponse.headers['set-cookie']
    const setCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader

    expect(setCookie).toContain('boss_helper_agent_relay_session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Strict')
    expect(setCookie).not.toContain(token)

    const bootstrapResponse = await requestText(`https://127.0.0.1:${httpsPort}/relay/bootstrap`, {
      headers: {
        cookie: String(setCookie).split(';')[0],
      },
    })
    const bootstrapPayload = JSON.parse(bootstrapResponse.body) as Record<string, unknown>

    expect(bootstrapResponse.statusCode).toBe(200)
    expect(bootstrapPayload.ok).toBe(true)
    expect(String(bootstrapPayload.eventPortName)).toContain('__boss_helper_agent_event_port__:')

    const oversizedBody = JSON.stringify({
      command: 'stats',
      payload: {
        text: 'x'.repeat(512),
      },
    })
    const oversizedResponse = await fetch(`http://127.0.0.1:${httpsPort - 1}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(oversizedBody)),
        'x-boss-helper-agent-token': token,
      },
      body: oversizedBody,
    })
    const oversizedPayload = await oversizedResponse.json() as Record<string, unknown>

    expect(oversizedResponse.status).toBe(413)
    expect(oversizedPayload).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'request-body-too-large',
      }),
    )
  })
})
