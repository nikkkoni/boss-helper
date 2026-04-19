// @ts-check

import { existsSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { printJson, writeStderrLine } from './shared/logging.mjs'
import { BOSS_HELPER_AGENT_EXTENSION_ID } from './agent-extension.mjs'
import { getAgentBridgeRuntime, repoRoot } from './shared/security.mjs'
import { ensureBridge } from './agent-launch.mjs'

/** @typedef {import('./types.d.ts').AgentBootstrapOptions} AgentBootstrapOptions */
/** @typedef {import('./types.d.ts').AgentManagedBrowserOptions} AgentManagedBrowserOptions */

const defaultProfileDir = join(repoRoot, '.boss-helper-agent-profile')
const extensionBuildMetaFile = join(repoRoot, '.boss-helper-agent-extension-build.json')
const defaultTargetUrl = 'https://www.zhipin.com/web/geek/jobs'
const chromeExtensionPath = resolve(repoRoot, '.output/chrome-mv3')
const DEFAULT_STARTUP_TIMEOUT_MS = 60_000
const DEFAULT_MACOS_BROWSER = 'Google Chrome'
const EXTENSION_BUILD_META_VERSION = 2

/** @param {string[]} argv @returns {AgentBootstrapOptions} */
export function parseBootstrapArgs(argv) {
  const headlessFromEnv = process.env.BOSS_HELPER_AGENT_HEADLESS == null
    ? undefined
    : process.env.BOSS_HELPER_AGENT_HEADLESS === 'true'
  const options = {
    browser: process.env.BOSS_HELPER_AGENT_BROWSER?.trim() || DEFAULT_MACOS_BROWSER,
    forceBuild: false,
    headless: false,
    host: process.env.BOSS_HELPER_AGENT_HOST ?? '127.0.0.1',
    hold: false,
    noBrowser: false,
    noBuild: false,
    port: Number.parseInt(process.env.BOSS_HELPER_AGENT_PORT ?? '4317', 10),
    profileDir: process.env.BOSS_HELPER_AGENT_PROFILE_DIR?.trim() || defaultProfileDir,
    startupTimeoutMs: Number.parseInt(process.env.BOSS_HELPER_AGENT_STARTUP_TIMEOUT_MS ?? `${DEFAULT_STARTUP_TIMEOUT_MS}`, 10),
    targetUrl: process.env.BOSS_HELPER_AGENT_TARGET_URL?.trim() || defaultTargetUrl,
  }
  let headless = headlessFromEnv

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]

    if (token === '--host' && next) {
      options.host = next
      index += 1
      continue
    }
    if ((token === '--browser' || token === '-b') && next) {
      options.browser = next
      index += 1
      continue
    }
    if (token === '--port' && next) {
      options.port = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if ((token === '--profile-dir' || token === '--user-data-dir') && next) {
      options.profileDir = resolve(next)
      index += 1
      continue
    }
    if ((token === '--target-url' || token === '--url') && next) {
      options.targetUrl = next
      index += 1
      continue
    }
    if (token === '--startup-timeout' && next) {
      options.startupTimeoutMs = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--headless') {
      headless = true
      continue
    }
    if (token === '--headed') {
      headless = false
      continue
    }
    if (token === '--hold') {
      options.hold = true
      continue
    }
    if (token === '--no-browser') {
      options.noBrowser = true
      continue
    }
    if (token === '--no-build') {
      options.noBuild = true
      continue
    }
    if (token === '--force-build') {
      options.forceBuild = true
      continue
    }
  }

  options.headless = headless ?? (options.hold ? false : hasSeededProfile(options.profileDir))

  return options
}

function hasSeededProfile(profileDir) {
  try {
    return existsSync(profileDir) && readdirSync(profileDir).length > 0
  } catch {
    return false
  }
}

async function readExtensionBuildMeta() {
  try {
    return JSON.parse(await readFile(extensionBuildMetaFile, 'utf8'))
  } catch {
    return null
  }
}

async function writeExtensionBuildMeta(meta) {
  await writeFile(extensionBuildMetaFile, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
}

function hasBuiltChromeExtension() {
  return existsSync(chromeExtensionPath)
}

async function runBuildChrome() {
  await new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['build:chrome'], {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    })

    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }
      reject(new Error(`pnpm build:chrome failed with exit code ${code ?? 'null'}`))
    })
  })
}

async function ensureExtensionBuild(options) {
  const runtime = getAgentBridgeRuntime({
    ...process.env,
    BOSS_HELPER_AGENT_HOST: options.host,
    BOSS_HELPER_AGENT_PORT: String(options.port),
  })
  const buildMeta = await readExtensionBuildMeta()
  const buildMatchesToken = buildMeta?.bridgeToken === runtime.token
  const buildMatchesBootstrapVersion = buildMeta?.bootstrapVersion === EXTENSION_BUILD_META_VERSION

  if (options.noBuild && !hasBuiltChromeExtension()) {
    throw new Error(`缺少扩展构建产物: ${chromeExtensionPath}。请先运行 pnpm build:chrome，或去掉 --no-build。`)
  }

  if (options.noBuild) {
    return { built: false, extensionPath: chromeExtensionPath }
  }

  if (options.forceBuild || !hasBuiltChromeExtension() || !buildMatchesToken || !buildMatchesBootstrapVersion) {
    await runBuildChrome()
    await writeExtensionBuildMeta({
      bootstrapVersion: EXTENSION_BUILD_META_VERSION,
      bridgeToken: runtime.token,
      builtAt: new Date().toISOString(),
      extensionPath: chromeExtensionPath,
    })
    return { built: true, extensionPath: chromeExtensionPath }
  }

  return { built: false, extensionPath: chromeExtensionPath }
}

/** @param {AgentManagedBrowserOptions} options */
async function launchManagedBrowser(options) {
  await mkdir(options.profileDir, { recursive: true })

  const runtime = getAgentBridgeRuntime({
    ...process.env,
    BOSS_HELPER_AGENT_HOST: options.host,
    BOSS_HELPER_AGENT_PORT: String(options.port),
  })
  const relayUrl = new URL(`${runtime.httpsBaseUrl}/`)
  relayUrl.searchParams.set('managed', '1')
  relayUrl.searchParams.set('extensionId', options.extensionId)

  const chromeArgs = [
    `--user-data-dir=${options.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    relayUrl.toString(),
    options.targetUrl,
  ]
  if (options.headless) {
    chromeArgs.push('--headless=new')
  }

  if (process.platform === 'darwin') {
    const browserBinary = options.browser === DEFAULT_MACOS_BROWSER
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : options.browser
    const child = spawn(browserBinary, chromeArgs, {
      detached: options.headless,
      stdio: options.headless ? 'ignore' : 'ignore',
    })
    if (options.headless) {
      child.unref()
    }
    return {
      extensionId: options.extensionId,
      process: child,
      relayUrl: relayUrl.toString(),
      targetUrl: options.targetUrl,
    }
  }

  const openArgs = process.platform === 'win32'
    ? ['/c', 'start', '', options.targetUrl]
    : [options.targetUrl]
  const openCommand = process.platform === 'win32' ? 'cmd' : 'xdg-open'
  spawn(openCommand, openArgs, { detached: true, stdio: 'ignore' }).unref()
  spawn(openCommand, process.platform === 'win32' ? ['/c', 'start', '', relayUrl.toString()] : [relayUrl.toString()], {
    detached: true,
    stdio: 'ignore',
  }).unref()
  return {
    extensionId: options.extensionId,
    relayUrl: relayUrl.toString(),
    targetUrl: options.targetUrl,
  }
}

async function readBootstrapSnapshot(options) {
  const runtime = getAgentBridgeRuntime({
    ...process.env,
    BOSS_HELPER_AGENT_HOST: options.host,
    BOSS_HELPER_AGENT_PORT: String(options.port),
  })
  const headers = {
    'x-boss-helper-agent-token': runtime.token,
  }
  const [statusResponse, readinessResponse] = await Promise.all([
    fetch(`${runtime.httpBaseUrl}/status`, { headers }),
    fetch(`${runtime.httpBaseUrl}/command`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: 'readiness.get',
        waitForRelay: false,
      }),
    }),
  ])

  if (!statusResponse.ok || !readinessResponse.ok) {
    return null
  }

  const status = await statusResponse.json()
  const readiness = await readinessResponse.json()
  const relayConnected = status?.relayConnected === true
  const hasExtensionId = Array.isArray(status?.relays)
    && status.relays.some((relay) => typeof relay?.extensionId === 'string' && relay.extensionId.trim())
  const readinessData = readiness?.data
  const readinessOk = readiness?.ok === true && readinessData && typeof readinessData === 'object'

  return {
    hasRunnableRelay: relayConnected && hasExtensionId && readinessOk,
    ready: readinessData?.ready === true,
    readiness,
    relayConnected,
    status,
  }
}

async function waitForBootstrapReady(options, relayUrl) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < options.startupTimeoutMs) {
    try {
      const snapshot = await readBootstrapSnapshot(options)
      if (snapshot?.hasRunnableRelay) {
        return {
          ready: snapshot.ready,
          readiness: snapshot.readiness,
          relayConnected: snapshot.relayConnected,
          relayUrl,
          status: snapshot.status,
        }
      }
    } catch {
      // Retry until timeout.
    }

    await sleep(500)
  }

  throw new Error(`bootstrap 就绪超时，请检查 relay 是否已连接且页面是否已打开: ${relayUrl}`)
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @param {AgentBootstrapOptions} options */
export async function bootstrapAgentEnvironment(options) {
  const bridge = await ensureBridge({
    host: options.host,
    port: options.port,
  })
  if (!options.hold) {
    try {
      const existing = await readBootstrapSnapshot(options)
      if (existing?.hasRunnableRelay) {
        return {
          bridge,
          browserManaged: false,
          extensionBuilt: false,
          pageReady: existing.ready,
          profileDir: options.profileDir,
          readiness: existing.readiness,
          relayConnected: existing.relayConnected,
          relayUrl: `${getAgentBridgeRuntime({
            ...process.env,
            BOSS_HELPER_AGENT_HOST: options.host,
            BOSS_HELPER_AGENT_PORT: String(options.port),
          }).httpsBaseUrl}/`,
          reusedExistingRelay: true,
          status: existing.status,
          targetUrl: options.targetUrl,
        }
      }
    } catch {
      // Fall through to managed bootstrap.
    }
  }

  if (options.noBrowser) {
    const build = await ensureExtensionBuild(options)
    const runtime = getAgentBridgeRuntime({
      ...process.env,
      BOSS_HELPER_AGENT_HOST: options.host,
      BOSS_HELPER_AGENT_PORT: String(options.port),
    })

    return {
      bridge,
      browserManaged: false,
      extensionBuilt: build.built,
      extensionPath: build.extensionPath,
      profileDir: options.profileDir,
      relayUrl: `${runtime.httpsBaseUrl}/`,
      targetUrl: options.targetUrl,
    }
  }

  const build = await ensureExtensionBuild(options)
  const browser = await launchManagedBrowser({
    browser: options.browser,
    extensionId: BOSS_HELPER_AGENT_EXTENSION_ID,
    extensionPath: build.extensionPath,
    headless: options.headless,
    host: options.host,
    port: options.port,
    profileDir: options.profileDir,
    targetUrl: options.targetUrl,
  })
  const readiness = await waitForBootstrapReady(options, browser.relayUrl)

  return attachManagedBrowserContext({
    bridge,
    browserManaged: true,
    extensionBuilt: build.built,
    extensionId: browser.extensionId,
    extensionPath: build.extensionPath,
    pageReady: readiness.ready,
    profileDir: options.profileDir,
    readiness: readiness.readiness,
    relayUrl: browser.relayUrl,
    relayConnected: readiness.relayConnected,
    status: readiness.status,
    targetUrl: browser.targetUrl,
  }, browser.process)
}

function attachManagedBrowserContext(result, browserProcess) {
  if (!browserProcess) {
    return result
  }

  Object.defineProperty(result, 'managedBrowserContext', {
    configurable: false,
    enumerable: false,
    value: browserProcess,
    writable: false,
  })
  return result
}

async function holdManagedBrowser(result) {
  const browserProcess = result?.managedBrowserContext
  if (!browserProcess) {
    return
  }

  await new Promise((resolve) => {
    const shutdown = () => {
      browserProcess.kill('SIGTERM')
      resolve(undefined)
    }

    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
    browserProcess.once('exit', resolve)
  })
}

async function main() {
  const options = parseBootstrapArgs(process.argv.slice(2))
  const result = await bootstrapAgentEnvironment(options)

  printJson({
    ok: true,
    ...result,
  })

  if (result.browserManaged && result.pageReady !== true) {
    writeStderrLine(`Next: 真实浏览器、relay 和 Boss 页面已拉起；请先在该 profile 手动安装扩展目录 ${chromeExtensionPath}，后续仅通过 MCP/bridge/插件链路间接操作页面。`)
  }

  if (options.hold) {
    await holdManagedBrowser(result)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    printJson({
      ok: false,
      code: 'agent-bootstrap-failed',
      message: error instanceof Error ? error.message : 'unknown error',
    })
    process.exitCode = 1
  })
}
