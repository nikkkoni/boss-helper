import { openSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { getAgentBridgeRuntime } from './agent-security.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(scriptDir)
const bridgeScript = join(scriptDir, 'agent-bridge.mjs')
const pidFile = join(repoRoot, '.boss-helper-agent-bridge.pid')
const logFile = join(repoRoot, '.boss-helper-agent-bridge.log')

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

const options = parseArgs(process.argv.slice(2))

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

async function isBridgeHealthy() {
  try {
    const { ok, data } = await fetchJson(`http://${options.host}:${options.port}/health`)
    return Boolean(ok && data?.ok)
  } catch {
    return false
  }
}

function startBridgeProcess() {
  const logFd = openSync(logFile, 'a')
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
  return child.pid
}

async function ensureBridge() {
  if (await isBridgeHealthy()) {
    return { started: false }
  }

  const pid = startBridgeProcess()
  await writeFile(pidFile, `${pid}\n`, 'utf8')

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isBridgeHealthy()) {
      return { started: true, pid }
    }
    await sleep(300)
  }

  throw new Error(`bridge 启动超时，请检查日志: ${logFile}`)
}

function buildRelayUrl() {
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

async function main() {
  const bridge = await ensureBridge()
  const relayUrl = buildRelayUrl()

  openRelayPage(relayUrl)

  console.log(
    JSON.stringify(
      {
        ok: true,
        bridgeStarted: bridge.started,
        host: options.host,
        logFile,
        pid: bridge.pid ?? null,
        relayUrl,
      },
      null,
      2,
    ),
  )

  console.error('\nNext: 在 Chromium 浏览器中先信任本地证书，再保持 relay 页面打开；如果 URL 里带了 extensionId，页面会自动预填。')
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      {
        ok: false,
        code: 'agent-launch-failed',
        message: error instanceof Error ? error.message : 'unknown error',
        logFile,
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
})
