// @ts-check

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { printJson, writeStderrLine } from './shared/logging.mjs'
import { BOSS_HELPER_AGENT_EXTENSION_ID } from './agent-extension.mjs'
import { ensureBridge } from './agent-launch.mjs'
import { getAgentBridgeRuntime, repoRoot } from './shared/security.mjs'

/** @typedef {import('./types.d.ts').AgentBootstrapOptions} AgentBootstrapOptions */

const extensionBuildMetaFile = resolve(repoRoot, '.boss-helper-agent-extension-build.json')
const defaultTargetUrl = 'https://www.zhipin.com/web/geek/jobs'
const chromeExtensionPath = resolve(repoRoot, '.output/chrome-mv3')
const EXTENSION_BUILD_META_VERSION = 3

/** @param {string} token */
function isDeprecatedBrowserFlag(token) {
  return [
    '--browser',
    '-b',
    '--profile-dir',
    '--user-data-dir',
    '--startup-timeout',
    '--headless',
    '--headed',
    '--hold',
    '--no-browser',
  ].includes(token)
}

/** @param {string} token */
function deprecatedFlagMessage(token) {
  return `${token} 已移除。为降低 Boss 风控风险，agent bootstrap 不再启动或持有任何受管浏览器；请改用你已登录的真实浏览器手动打开 relay 页面和 Boss 页面。`
}

/** @param {string[]} argv @returns {AgentBootstrapOptions} */
export function parseBootstrapArgs(argv) {
  const options = {
    browser: process.env.BOSS_HELPER_AGENT_BROWSER?.trim() || '',
    forceBuild: false,
    host: process.env.BOSS_HELPER_AGENT_HOST ?? '127.0.0.1',
    noBuild: false,
    noOpen: false,
    port: Number.parseInt(process.env.BOSS_HELPER_AGENT_PORT ?? '4317', 10),
    targetUrl: process.env.BOSS_HELPER_AGENT_TARGET_URL?.trim() || defaultTargetUrl,
  }

  for (let index = 0; index < argv.length; index += 1) {
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
    if ((token === '--target-url' || token === '--url') && next) {
      options.targetUrl = next
      index += 1
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
    if (token === '--no-open') {
      options.noOpen = true
      continue
    }
    if (isDeprecatedBrowserFlag(token)) {
      throw new Error(deprecatedFlagMessage(token))
    }
  }

  if (process.env.BOSS_HELPER_AGENT_HEADLESS != null) {
    throw new Error(deprecatedFlagMessage('BOSS_HELPER_AGENT_HEADLESS'))
  }
  if (process.env.BOSS_HELPER_AGENT_PROFILE_DIR?.trim()) {
    throw new Error(deprecatedFlagMessage('BOSS_HELPER_AGENT_PROFILE_DIR'))
  }

  return options
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

function buildRelayUrl(options) {
  const runtime = getAgentBridgeRuntime({
    ...process.env,
    BOSS_HELPER_AGENT_HOST: options.host,
    BOSS_HELPER_AGENT_PORT: String(options.port),
  })
  const relayUrl = new URL(`${runtime.httpsBaseUrl}/`)
  relayUrl.searchParams.set('extensionId', BOSS_HELPER_AGENT_EXTENSION_ID)
  return relayUrl.toString()
}

function openUrl(url, options) {
  if (options.noOpen) {
    return false
  }

  if (process.platform === 'darwin') {
    const args = options.browser ? ['-a', options.browser, url] : [url]
    spawn('open', args, { detached: true, stdio: 'ignore' }).unref()
    return true
  }

  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    return true
  }

  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  return true
}

/** @param {AgentBootstrapOptions} options */
export async function bootstrapAgentEnvironment(options) {
  const bridge = await ensureBridge({
    host: options.host,
    port: options.port,
  })
  const build = await ensureExtensionBuild(options)
  const relayUrl = buildRelayUrl(options)
  const relayOpened = openUrl(relayUrl, options)
  const targetOpened = openUrl(options.targetUrl, options)

  return {
    bridge,
    browserManaged: false,
    extensionBuilt: build.built,
    extensionId: BOSS_HELPER_AGENT_EXTENSION_ID,
    extensionPath: build.extensionPath,
    relayOpened,
    relayUrl,
    targetOpened,
    targetUrl: options.targetUrl,
  }
}

async function main() {
  const options = parseBootstrapArgs(process.argv.slice(2))
  const result = await bootstrapAgentEnvironment(options)

  printJson({
    ok: true,
    ...result,
  })

  writeStderrLine(`Next: 请在固定的真实 Chrome Profile 中保持 relay 页面常驻: ${result.relayUrl}`)
  writeStderrLine(`Next: 请在同一真实 Chrome Profile 中打开 Boss 页面: ${result.targetUrl}`)
  writeStderrLine(
    `Next: 如未安装扩展，请在当前真实 Chrome Profile 的 chrome://extensions 中开启开发者模式并加载 ${chromeExtensionPath}。默认扩展 ID 为 ${BOSS_HELPER_AGENT_EXTENSION_ID}。`,
  )
  writeStderrLine('Next: 不要依赖临时 --load-extension、Playwright E2E 或 WXT dev 浏览器会话；那类会话关闭或重启后不会把扩展持久安装到你的日常 Chrome。')
  writeStderrLine('Next: 后续所有 Boss 操作仅通过 MCP/bridge/extension/page 间接链路执行，不使用受管浏览器自举。')
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
