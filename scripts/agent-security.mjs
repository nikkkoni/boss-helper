// @ts-check

import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import selfsigned from 'selfsigned'

/** @typedef {import('./types.d.ts').AgentBridgeCertificate} AgentBridgeCertificate */
/** @typedef {import('./types.d.ts').AgentBridgeRuntime} AgentBridgeRuntime */

const scriptDir = dirname(fileURLToPath(import.meta.url))
const PRIVATE_FILE_MODE = 0o600
const AGENT_BRIDGE_TOKEN_FILE_ENV = 'BOSS_HELPER_AGENT_TOKEN_FILE'
const AGENT_BRIDGE_CERT_FILE_ENV = 'BOSS_HELPER_AGENT_CERT_FILE'

export const repoRoot = dirname(scriptDir)
export const AGENT_BRIDGE_TOKEN_ENV = 'BOSS_HELPER_AGENT_BRIDGE_TOKEN'
export const AGENT_BRIDGE_HOST_ENV = 'BOSS_HELPER_AGENT_HOST'
export const AGENT_BRIDGE_PORT_ENV = 'BOSS_HELPER_AGENT_PORT'
export const AGENT_BRIDGE_HTTPS_PORT_ENV = 'BOSS_HELPER_AGENT_HTTPS_PORT'
export const AGENT_BRIDGE_AUTH_HEADER = 'x-boss-helper-agent-token'
export const AGENT_BRIDGE_EVENT_PORT_PREFIX = '__boss_helper_agent_event_port__'

const agentBridgeTokenFile = join(repoRoot, '.boss-helper-agent-token')
const agentBridgeCertFile = join(repoRoot, '.boss-helper-agent-cert.json')

/** @param {NodeJS.ProcessEnv} [env] */
function getAgentBridgeTokenFile(env = process.env) {
  return env[AGENT_BRIDGE_TOKEN_FILE_ENV]?.trim() || agentBridgeTokenFile
}

/** @param {NodeJS.ProcessEnv} [env] */
function getAgentBridgeCertFile(env = process.env) {
  return env[AGENT_BRIDGE_CERT_FILE_ENV]?.trim() || agentBridgeCertFile
}

/** @param {string} filePath */
function ensurePrivateFileModeSync(filePath) {
  chmodSync(filePath, PRIVATE_FILE_MODE)
}

/** @param {string} filePath */
async function ensurePrivateFileMode(filePath) {
  await chmod(filePath, PRIVATE_FILE_MODE)
}

/** @param {string} filePath @param {string} content */
function writePrivateFileSync(filePath, content) {
  writeFileSync(filePath, content, { encoding: 'utf8', mode: PRIVATE_FILE_MODE })
  ensurePrivateFileModeSync(filePath)
}

/** @param {string} filePath @param {string} content */
async function writePrivateFile(filePath, content) {
  await writeFile(filePath, content, { encoding: 'utf8', mode: PRIVATE_FILE_MODE })
  await ensurePrivateFileMode(filePath)
}

/** @param {string | undefined} value @param {number} fallback */
function parsePort(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** @param {NodeJS.ProcessEnv} [env] */
export function getAgentBridgeHost(env = process.env) {
  return env[AGENT_BRIDGE_HOST_ENV] ?? '127.0.0.1'
}

/** @param {NodeJS.ProcessEnv} [env] */
export function getAgentBridgePort(env = process.env) {
  return parsePort(env[AGENT_BRIDGE_PORT_ENV], 4317)
}

/** @param {NodeJS.ProcessEnv} [env] */
export function getAgentBridgeHttpsPort(env = process.env) {
  return parsePort(env[AGENT_BRIDGE_HTTPS_PORT_ENV], getAgentBridgePort(env) + 1)
}

/** @param {NodeJS.ProcessEnv} [env] */
export function getAgentBridgeTokenSync(env = process.env) {
  const tokenFile = getAgentBridgeTokenFile(env)
  const tokenFromEnv = env[AGENT_BRIDGE_TOKEN_ENV]?.trim()
  if (tokenFromEnv) {
    if (!existsSync(tokenFile) || readFileSync(tokenFile, 'utf8').trim() !== tokenFromEnv) {
      writePrivateFileSync(tokenFile, `${tokenFromEnv}\n`)
    } else {
      ensurePrivateFileModeSync(tokenFile)
    }
    return tokenFromEnv
  }

  if (existsSync(tokenFile)) {
    const storedToken = readFileSync(tokenFile, 'utf8').trim()
    if (storedToken) {
      ensurePrivateFileModeSync(tokenFile)
      return storedToken
    }
  }

  const generatedToken = randomBytes(32).toString('hex')
  writePrivateFileSync(tokenFile, `${generatedToken}\n`)
  return generatedToken
}

/** @param {NodeJS.ProcessEnv} [env] @returns {AgentBridgeRuntime} */
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

/** @param {string} token @param {Record<string, string>} [headers] */
export function createAgentBridgeAuthHeaders(token, headers = {}) {
  return {
    ...headers,
    [AGENT_BRIDGE_AUTH_HEADER]: token,
  }
}

export function getAgentBridgeEventPortName(token) {
  return `${AGENT_BRIDGE_EVENT_PORT_PREFIX}:${token}`
}

/** @param {NodeJS.ProcessEnv} [env] @returns {Promise<AgentBridgeCertificate>} */
export async function getAgentBridgeCertificate(env = process.env) {
  const certFile = getAgentBridgeCertFile(env)

  try {
    const stored = /** @type {Partial<AgentBridgeCertificate>} */ (JSON.parse(await readFile(certFile, 'utf8')))
    if (typeof stored?.key === 'string' && typeof stored?.cert === 'string') {
      await ensurePrivateFileMode(certFile)
      return /** @type {AgentBridgeCertificate} */ (stored)
    }
  } catch {
    // Fall through and generate a new localhost certificate.
  }

  const certificateOptions = {
    algorithm: 'sha256',
    days: 3650,
    extensions: [
      {
        name: 'basicConstraints',
        cA: false,
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
  }

  const certificate = await selfsigned.generate(
    [{ name: 'commonName', value: 'localhost' }],
    /** @type {any} */ (certificateOptions),
  )

  const payload = /** @type {AgentBridgeCertificate} */ ({
    cert: certificate.cert,
    key: certificate.private,
  })

  await writePrivateFile(certFile, `${JSON.stringify(payload, null, 2)}\n`)
  return payload
}
