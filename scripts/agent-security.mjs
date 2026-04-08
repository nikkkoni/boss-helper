import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import selfsigned from 'selfsigned'

const scriptDir = dirname(fileURLToPath(import.meta.url))

export const repoRoot = dirname(scriptDir)
export const AGENT_BRIDGE_TOKEN_ENV = 'BOSS_HELPER_AGENT_BRIDGE_TOKEN'
export const AGENT_BRIDGE_HOST_ENV = 'BOSS_HELPER_AGENT_HOST'
export const AGENT_BRIDGE_PORT_ENV = 'BOSS_HELPER_AGENT_PORT'
export const AGENT_BRIDGE_HTTPS_PORT_ENV = 'BOSS_HELPER_AGENT_HTTPS_PORT'
export const AGENT_BRIDGE_AUTH_HEADER = 'x-boss-helper-agent-token'
export const AGENT_BRIDGE_TOKEN_QUERY = 'token'
export const AGENT_BRIDGE_EVENT_PORT_PREFIX = '__boss_helper_agent_event_port__'

const agentBridgeTokenFile = join(repoRoot, '.boss-helper-agent-token')
const agentBridgeCertFile = join(repoRoot, '.boss-helper-agent-cert.json')

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getAgentBridgeHost(env = process.env) {
  return env[AGENT_BRIDGE_HOST_ENV] ?? '127.0.0.1'
}

export function getAgentBridgePort(env = process.env) {
  return parsePort(env[AGENT_BRIDGE_PORT_ENV], 4317)
}

export function getAgentBridgeHttpsPort(env = process.env) {
  return parsePort(env[AGENT_BRIDGE_HTTPS_PORT_ENV], getAgentBridgePort(env) + 1)
}

export function getAgentBridgeTokenSync(env = process.env) {
  const tokenFromEnv = env[AGENT_BRIDGE_TOKEN_ENV]?.trim()
  if (tokenFromEnv) {
    if (!existsSync(agentBridgeTokenFile) || readFileSync(agentBridgeTokenFile, 'utf8').trim() !== tokenFromEnv) {
      writeFileSync(agentBridgeTokenFile, `${tokenFromEnv}\n`, 'utf8')
    }
    return tokenFromEnv
  }

  if (existsSync(agentBridgeTokenFile)) {
    const storedToken = readFileSync(agentBridgeTokenFile, 'utf8').trim()
    if (storedToken) {
      return storedToken
    }
  }

  const generatedToken = randomBytes(32).toString('hex')
  writeFileSync(agentBridgeTokenFile, `${generatedToken}\n`, 'utf8')
  return generatedToken
}

export function getAgentBridgeRuntime(env = process.env) {
  const host = getAgentBridgeHost(env)
  const port = getAgentBridgePort(env)
  const httpsPort = getAgentBridgeHttpsPort(env)
  const token = getAgentBridgeTokenSync(env)

  return {
    host,
    port,
    httpsPort,
    token,
    httpBaseUrl: `http://${host}:${port}`,
    httpsBaseUrl: `https://${host}:${httpsPort}`,
  }
}

export function createAgentBridgeAuthHeaders(token, headers = {}) {
  return {
    ...headers,
    [AGENT_BRIDGE_AUTH_HEADER]: token,
  }
}

export function getAgentBridgeEventPortName(token) {
  return `${AGENT_BRIDGE_EVENT_PORT_PREFIX}:${token}`
}

export async function getAgentBridgeCertificate() {
  try {
    const stored = JSON.parse(await readFile(agentBridgeCertFile, 'utf8'))
    if (typeof stored?.key === 'string' && typeof stored?.cert === 'string') {
      return stored
    }
  } catch {
    // Fall through and generate a new localhost certificate.
  }

  const certificate = await selfsigned.generate(
    [{ name: 'commonName', value: 'localhost' }],
    {
      algorithm: 'sha256',
      days: 3650,
      extensions: [
        {
          name: 'basicConstraints',
          cA: true,
        },
        {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true,
        },
        {
          name: 'extKeyUsage',
          serverAuth: true,
        },
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 7, ip: '127.0.0.1' },
          ],
        },
      ],
      keySize: 2048,
    },
  )

  const payload = {
    cert: certificate.cert,
    key: certificate.private,
  }

  await writeFile(agentBridgeCertFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}
