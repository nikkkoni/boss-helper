// @ts-check

import { pathToFileURL } from 'node:url'

import {
  printJson,
} from './shared/logging.mjs'
import {
  createAgentBridgeAuthHeaders,
  getAgentBridgeRuntime,
} from './shared/security.mjs'

/** @typedef {import('./types.d.ts').AgentBridgeRuntime} AgentBridgeRuntime */
/** @typedef {import('./types.d.ts').AgentCliOptions} AgentCliOptions */

const args = process.argv.slice(2)

function printUsage() {
  console.log(`boss-helper agent cli

usage:
  node ./scripts/agent-cli.mjs stats
  node ./scripts/agent-cli.mjs start --payload '{"jobIds":["encryptJobId-1"]}'
  node ./scripts/agent-cli.mjs chat.send --payload '{"to_uid":"123","to_name":"encryptBossId","content":"你好，我对这个岗位很感兴趣"}'
  node ./scripts/agent-cli.mjs logs.query --payload '{"limit":10,"status":["AI筛选"]}'
  node ./scripts/agent-cli.mjs batch --payload '[{"command":"stats"},{"command":"jobs.list","payload":{"statusFilter":["wait"]}}]'
  node ./scripts/agent-cli.mjs status
  node ./scripts/agent-cli.mjs doctor

options:
  --host <host>       default 127.0.0.1
  --port <port>       default 4317
  --timeout <ms>      command timeout for POST /command
  --payload <json>    JSON payload for command or batch array
  --stop-on-error     stop remaining batch commands after first failure
   --no-wait-relay     fail immediately when relay is not connected`)
}

function parseJsonArg(raw, fieldName) {
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `${fieldName} 必须是合法 JSON: ${error instanceof Error ? error.message : 'unknown error'}`,
    )
  }
}

/** @param {string[]} argv @returns {AgentCliOptions} */
export function parseArgs(argv) {
  const hasExplicitCommand = typeof argv[0] === 'string' && !argv[0].startsWith('-')
  const options = {
    host: '127.0.0.1',
    port: 4317,
    timeoutMs: undefined,
    payload: undefined,
    stopOnError: false,
    waitForRelay: true,
    command: hasExplicitCommand ? argv[0] : 'stats',
  }

  for (let index = hasExplicitCommand ? 1 : 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]

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
    if (token === '--payload' && next) {
      options.payload = parseJsonArg(next, '--payload')
      index += 1
      continue
    }
    if (token === '--stop-on-error') {
      options.stopOnError = true
      continue
    }
    if (token === '--no-wait-relay') {
      options.waitForRelay = false
      continue
    }
    if (token === '--help' || token === '-h') {
      options.command = 'help'
      continue
    }
  }

  return options
}

let options

/** @returns {string} */
function buildBaseUrl() {
  return `http://${options.host}:${options.port}`
}

/** @returns {AgentBridgeRuntime} */
function getBridgeRuntime() {
  return getAgentBridgeRuntime({
    ...process.env,
    BOSS_HELPER_AGENT_HOST: options.host,
    BOSS_HELPER_AGENT_PORT: String(options.port),
  })
}

async function requestJson(path, init = undefined) {
  const response = await fetch(`${buildBaseUrl()}${path}`, {
    ...init,
    headers: createAgentBridgeAuthHeaders(getBridgeRuntime().token, init?.headers ?? {}),
  })
  const data = await response.json()
  return { response, data }
}

function printHint(data) {
  if (!data || typeof data !== 'object') {
    return
  }

  if (data.code === 'relay-not-connected') {
    console.error(
      `\nHint: 先运行 node ./scripts/agent-bridge.mjs，然后在 Chromium 浏览器打开 ${getBridgeRuntime().httpsBaseUrl}/，填写扩展 ID 并保持 relay 页面常驻。`,
    )
  }

  if (data.code === 'target-tab-not-found') {
    console.error('\nHint: 请先打开 Boss 职位页，并确认插件已经完成页面初始化。')
  }
}

async function runDoctor() {
  try {
    const { data: health } = await requestJson('/health')
    const { data: status } = await requestJson('/status')
    const result = {
      ok: Boolean(health?.ok && status?.ok && status?.relayConnected),
      health,
      status,
      checks: {
        bridgeListening: Boolean(health?.ok),
        relayConnected: Boolean(status?.relayConnected),
        knownExtensionId: Boolean(status?.relays?.some((relay) => relay.extensionId)),
      },
      nextSteps: [],
    }

    if (!result.checks.bridgeListening) {
      result.nextSteps.push('运行 node ./scripts/agent-bridge.mjs 启动本地 companion 服务。')
    }
    if (!result.checks.relayConnected) {
      result.nextSteps.push(`在 Chromium 浏览器打开 ${getBridgeRuntime().httpsBaseUrl}/ 并保持页面打开。`)
    }
    if (!result.checks.knownExtensionId) {
      result.nextSteps.push('在 relay 页面填写扩展 ID，然后点击“保存并重连”。')
    }
    if (result.checks.bridgeListening && result.checks.relayConnected) {
      result.nextSteps.push('确认 Boss 职位页已打开，然后重新执行 stats 或 start。')
    }

    printJson(result)
    process.exitCode = result.ok ? 0 : 1
  } catch (error) {
    printJson({
      ok: false,
      code: 'doctor-failed',
      message: error instanceof Error ? error.message : 'unknown error',
      nextSteps: ['运行 node ./scripts/agent-bridge.mjs 启动本地 companion 服务。'],
    })
    process.exitCode = 1
  }
}

async function run() {
  if (options.command === 'help') {
    printUsage()
    return
  }

  if (options.command === 'health') {
    const { response, data } = await requestJson('/health')
    printJson(data)
    if (!response.ok || data.ok === false) {
      process.exitCode = 1
    }
    return
  }

  if (options.command === 'status') {
    const { response, data } = await requestJson('/status')
    printJson(data)
    if (!response.ok || data.ok === false) {
      process.exitCode = 1
    }
    return
  }

  if (options.command === 'doctor') {
    await runDoctor()
    return
  }

  if (options.command === 'batch') {
    const { response, data } = await requestJson('/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commands: options.payload,
        stopOnError: options.stopOnError,
        waitForRelay: options.waitForRelay,
      }),
    })

    printJson(data)
    printHint(data)

    if (!response.ok || data.ok === false) {
      process.exitCode = 1
    }
    return
  }

  const { response, data } = await requestJson('/command', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      command: options.command,
      payload: options.payload,
      timeoutMs: options.timeoutMs,
      waitForRelay: options.waitForRelay,
    }),
  })

  printJson(data)
  printHint(data)

  if (!response.ok || data.ok === false) {
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    options = parseArgs(args)
    await run()
  } catch (error) {
    printJson({
      ok: false,
      code: options ? 'cli-request-failed' : 'cli-invalid-args',
      message: error instanceof Error ? error.message : 'unknown error',
    })
    if (options) {
      console.error('\nHint: 如果 companion 服务未启动，请先运行 node ./scripts/agent-bridge.mjs。')
    }
    process.exitCode = 1
  }
}
