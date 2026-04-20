// @ts-check

import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { printJson } from './shared/logging.mjs'
import { repoRoot } from './shared/security.mjs'

const pidFile = process.env.BOSS_HELPER_AGENT_PID_FILE ?? join(repoRoot, '.boss-helper-agent-bridge.pid')
const DEFAULT_STOP_TIMEOUT_MS = 5_000

/**
 * @typedef {object} AgentStopOptions
 * @property {string} host
 * @property {number} port
 * @property {number} timeoutMs
 * @property {boolean} help
 */

/** @param {string[]} argv @returns {AgentStopOptions} */
export function parseStopArgs(argv) {
  const options = {
    help: false,
    host: process.env.BOSS_HELPER_AGENT_HOST ?? '127.0.0.1',
    port: Number.parseInt(process.env.BOSS_HELPER_AGENT_PORT ?? '4317', 10),
    timeoutMs: Number.parseInt(process.env.BOSS_HELPER_AGENT_STOP_TIMEOUT_MS ?? `${DEFAULT_STOP_TIMEOUT_MS}`, 10),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]

    if (token === '--') {
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
    if (token === '--timeout' && next) {
      options.timeoutMs = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--help' || token === '-h') {
      options.help = true
    }
  }

  return options
}

function printUsage() {
  console.log(`boss-helper agent stop

usage:
  node ./scripts/agent-stop.mjs

options:
  --host <host>     default 127.0.0.1
  --port <port>     default 4317
  --timeout <ms>    default ${DEFAULT_STOP_TIMEOUT_MS}`)
}

/** @param {AgentStopOptions} options */
async function isBridgeHealthy(options) {
  try {
    const response = await fetch(`http://${options.host}:${options.port}/health`, {
      signal: AbortSignal.timeout(1_000),
    })
    const data = await response.json()
    return Boolean(response.ok && data?.ok)
  } catch {
    return false
  }
}

async function removePidFile() {
  await rm(pidFile, { force: true })
}

async function readPidFile() {
  try {
    return await readFile(pidFile, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/** @param {string | null} raw */
function parsePid(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null
  }

  const pid = Number.parseInt(raw.trim(), 10)
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

/** @param {number} pid */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      return false
    }
    if (error instanceof Error && 'code' in error && error.code === 'EPERM') {
      return true
    }
    throw error
  }
}

/** @param {number} pid */
function readProcessCommand(pid) {
  if (!isProcessAlive(pid)) {
    return null
  }

  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`],
      { encoding: 'utf8' },
    )
    if (result.error) {
      throw result.error
    }
    return result.stdout.trim() || null
  }

  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  if (result.error) {
    throw result.error
  }
  return result.stdout.trim() || null
}

/** @param {string | null} command */
function isBridgeCommand(command) {
  return typeof command === 'string' && command.includes('agent-bridge.mjs')
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @param {number} pid @param {number} timeoutMs */
async function waitForExit(pid, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return true
    }
    await sleep(100)
  }

  return !isProcessAlive(pid)
}

/** @param {AgentStopOptions} options */
export async function stopBridge(options) {
  const bridgeOnline = await isBridgeHealthy(options)
  const rawPid = await readPidFile()

  if (rawPid == null) {
    if (bridgeOnline) {
      return {
        ok: false,
        bridgeOnline,
        code: 'bridge-running-without-pid-file',
        message: 'bridge 在线，但未找到 pid 文件；为避免误杀其他进程，未执行停止。',
        pidFile,
      }
    }

    return {
      ok: true,
      bridgeOnline,
      code: 'bridge-not-running',
      message: 'bridge 未运行，无需停止。',
      pidFile,
      stopped: false,
    }
  }

  const pid = parsePid(rawPid)
  if (pid == null) {
    if (bridgeOnline) {
      return {
        ok: false,
        bridgeOnline,
        code: 'bridge-invalid-pid-file',
        message: 'bridge 在线，但 pid 文件内容无效；为避免误杀其他进程，未执行停止。',
        pidFile,
      }
    }

    await removePidFile()
    return {
      ok: true,
      bridgeOnline,
      cleanedStalePidFile: true,
      code: 'bridge-not-running',
      message: 'pid 文件无效，已按陈旧状态清理；当前 bridge 未运行。',
      pidFile,
      stopped: false,
    }
  }

  const command = readProcessCommand(pid)
  if (!command) {
    await removePidFile()

    if (bridgeOnline) {
      return {
        ok: false,
        bridgeOnline,
        cleanedStalePidFile: true,
        code: 'bridge-running-with-stale-pid-file',
        message: 'bridge 在线，但 pid 文件指向的进程已不存在；已清理陈旧 pid 文件，请手动检查当前 bridge。',
        pid,
        pidFile,
      }
    }

    return {
      ok: true,
      bridgeOnline,
      cleanedStalePidFile: true,
      code: 'bridge-not-running',
      message: 'pid 文件指向的进程已不存在，已清理陈旧 pid 文件。',
      pid,
      pidFile,
      stopped: false,
    }
  }

  if (!isBridgeCommand(command)) {
    if (!bridgeOnline) {
      await removePidFile()
      return {
        ok: true,
        bridgeOnline,
        actualCommand: command,
        cleanedStalePidFile: true,
        code: 'bridge-not-running',
        message: 'pid 文件指向的不是当前仓库的 bridge 进程，已按陈旧状态清理；未停止任何进程。',
        pid,
        pidFile,
        stopped: false,
      }
    }

    return {
      ok: false,
      bridgeOnline,
      actualCommand: command,
      code: 'bridge-pid-mismatch',
      message: 'pid 文件指向的进程不是当前仓库的 bridge；为避免误杀其他进程，未执行停止。',
      pid,
      pidFile,
    }
  }

  process.kill(pid, 'SIGTERM')

  if (!(await waitForExit(pid, options.timeoutMs))) {
    return {
      ok: false,
      bridgeOnline,
      code: 'bridge-stop-timeout',
      message: `已向 bridge 发送 SIGTERM，但进程未在 ${options.timeoutMs}ms 内退出。`,
      pid,
      pidFile,
    }
  }

  await removePidFile()
  return {
    ok: true,
    bridgeOnline,
    code: 'bridge-stopped',
    message: 'bridge 已停止。',
    pid,
    pidFile,
    stopped: true,
  }
}

async function main() {
  const options = parseStopArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  const result = await stopBridge(options)
  printJson(result)
  if (result.ok === false) {
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    printJson({
      ok: false,
      code: 'agent-stop-failed',
      message: error instanceof Error ? error.message : 'unknown error',
      pidFile,
    })
    process.exitCode = 1
  })
}
