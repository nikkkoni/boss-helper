// @ts-check

import { closeSync, openSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { printJson } from './shared/logging.mjs'
import { getAgentBridgeRuntime } from './shared/security.mjs'

/** @typedef {import('./types.d.ts').AgentLaunchOptions} AgentLaunchOptions */

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(scriptDir)
const bridgeScript = join(scriptDir, 'agent-bridge.mjs')
const pidFile = process.env.BOSS_HELPER_AGENT_PID_FILE ?? join(repoRoot, '.boss-helper-agent-bridge.pid')
const logFile = process.env.BOSS_HELPER_AGENT_LOG_FILE ?? join(repoRoot, '.boss-helper-agent-bridge.log')
/** @param {string[]} argv @returns {AgentLaunchOptions} */
function parseArgs(argv) {
  const options = {
    browser: '',
    extensionId: '',
    host: process.env.BOSS_HELPER_AGENT_HOST ?? '127.0.0.1',
    noOpen: false,
    port: Number.parseInt(process.env.BOSS_HELPER_AGENT_PORT ?? '4317', 10),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]

    if ((token === '--browser' || token === '-b') && next) {
      options.browser = next
      index += 1
      continue
    }
    if ((token === '--extension-id' || token === '-e') && next) {
      options.extensionId = next
      index += 1
      continue
    }
    if (token === '--host' && next) {
      options.host = next
      index += 1
      continue
    }
    if (token === '--port' && next) {
      options.port = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--no-open') {
      options.noOpen = true
    }
  }

  return options
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url) {
  const response = await fetch(url)
  return {
    ok: response.ok,
    status: response.status,
    data: await response.json(),
  }
}

async function isBridgeHealthy(options) {
  try {
    const { ok, data } = await fetchJson(`http://${options.host}:${options.port}/health`)
    return Boolean(ok && data?.ok)
  } catch {
    return false
  }
}

export function startBridgeProcess(options) {
  const logFd = openSync(logFile, 'a')
  try {
    const child = spawn(process.execPath, [bridgeScript], {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        BOSS_HELPER_AGENT_HOST: options.host,
        BOSS_HELPER_AGENT_PORT: String(options.port),
      },
      stdio: ['ignore', logFd, logFd],
    })

    child.unref()
    return child.pid ?? null
  } finally {
    closeSync(logFd)
  }
}

/** @param {Partial<AgentLaunchOptions>} [inputOptions] */
export async function ensureBridge(inputOptions = undefined) {
  const options = inputOptions ?? {
    browser: '',
    extensionId: '',
    host: process.env.BOSS_HELPER_AGENT_HOST ?? '127.0.0.1',
    noOpen: false,
    port: Number.parseInt(process.env.BOSS_HELPER_AGENT_PORT ?? '4317', 10),
  }

  if (await isBridgeHealthy(options)) {
    return { started: false }
  }

  const pid = startBridgeProcess(options)
  if (pid == null) {
    throw new Error('bridge 启动失败，未获取到子进程 pid')
  }
  await writeFile(pidFile, `${pid}\n`, 'utf8')

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isBridgeHealthy(options)) {
      return { started: true, pid }
    }
    await sleep(300)
  }

  throw new Error(`bridge 启动超时，请检查日志: ${logFile}`)
}

function buildRelayUrl(options) {
  const runtime = getAgentBridgeRuntime({
    ...process.env,
    BOSS_HELPER_AGENT_HOST: options.host,
    BOSS_HELPER_AGENT_PORT: String(options.port),
  })
  const url = new URL(`${runtime.httpsBaseUrl}/`)
  if (options.extensionId) {
    url.searchParams.set('extensionId', options.extensionId)
  }
  return url.toString()
}

function openRelayPage(url) {
  const options = arguments[1]
  if (options.noOpen) {
    return
  }

  if (process.platform === 'darwin') {
    const args = options.browser ? ['-a', options.browser, url] : [url]
    spawn('open', args, { detached: true, stdio: 'ignore' }).unref()
    return
  }

  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    return
  }

  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
}

export async function main() {
  const options = parseArgs(process.argv.slice(2))
  const bridge = await ensureBridge(options)
  const relayUrl = buildRelayUrl(options)

  openRelayPage(relayUrl, options)

  printJson({
    ok: true,
    bridgeStarted: bridge.started,
    host: options.host,
    logFile,
    pid: bridge.pid ?? null,
    relayUrl,
  })

  console.error('\nNext: 在你已登录 Boss 的真实浏览器中先信任本地证书，再保持 relay 页面打开；如果 URL 里带了 extensionId，页面会自动预填。')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    printJson({
      ok: false,
      code: 'agent-launch-failed',
      message: error instanceof Error ? error.message : 'unknown error',
      logFile,
    })
    process.exitCode = 1
  })
}
