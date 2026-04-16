import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, expect, type BrowserContext, type Page } from '@playwright/test'

import type {
  BossHelperAgentCommand,
  BossHelperAgentRequestPayloadMap,
  BossHelperAgentResponse,
} from '../../../src/message/agent'

type BridgeRequestEnvelope = {
  payload: {
    channel: '__boss_helper_agent__'
    command: BossHelperAgentCommand
    payload?: unknown
  }
  requestId: string
  type: '__boss_helper_agent_bridge_request__'
}

type BridgeResponseEnvelope = {
  payload: BossHelperAgentResponse<unknown>
  requestId: string
  type: '__boss_helper_agent_bridge_response__'
}

const currentDir = dirname(fileURLToPath(import.meta.url))
export const repoRoot = resolve(currentDir, '../../..')
export const chromeExtensionPath = resolve(repoRoot, '.output/chrome-mv3')

export interface ExtensionSession {
  cleanup: () => Promise<void>
  context: BrowserContext
  extensionId: string
}

export async function launchExtensionSession(): Promise<ExtensionSession> {
  if (!existsSync(chromeExtensionPath)) {
    throw new Error(
      `缺少预构建扩展输出: ${chromeExtensionPath}。请先运行 \`pnpm build:chrome\`，再执行 E2E 测试。`,
    )
  }

  const userDataDir = mkdtempSync(join(tmpdir(), 'boss-helper-e2e-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${chromeExtensionPath}`,
      `--load-extension=${chromeExtensionPath}`,
    ],
  })

  const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const extensionId = new URL(serviceWorker.url()).host

  return {
    context,
    extensionId,
    async cleanup() {
      await context.close()
      rmSync(userDataDir, { force: true, recursive: true })
    },
  }
}

export async function getOrCreatePage(context: BrowserContext) {
  return context.pages()[0] ?? context.newPage()
}

export async function callAgentCommand<TCommand extends BossHelperAgentCommand>(
  page: Page,
  command: TCommand,
  payload?: BossHelperAgentRequestPayloadMap[TCommand],
) {
  return page.evaluate(
    ({ command, payload }) => {
      const requestId = `e2e-${Math.random().toString(36).slice(2)}`

      return new Promise<BossHelperAgentResponse<unknown>>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener('message', onMessage)
          reject(new Error(`agent bridge timeout: ${command}`))
        }, 10_000)

        const onMessage = (event: MessageEvent<BridgeResponseEnvelope>) => {
          if (event.source !== window || event.origin !== window.location.origin) {
            return
          }
          if (event.data?.type !== '__boss_helper_agent_bridge_response__' || event.data.requestId !== requestId) {
            return
          }

          window.clearTimeout(timeout)
          window.removeEventListener('message', onMessage)
          resolve(event.data.payload)
        }

        window.addEventListener('message', onMessage)
        window.postMessage(
          {
            type: '__boss_helper_agent_bridge_request__',
            requestId,
            payload: {
              channel: '__boss_helper_agent__',
              command,
              ...(payload === undefined ? {} : { payload }),
            },
          } satisfies BridgeRequestEnvelope,
          window.location.origin,
        )
      })
    },
    { command, payload },
  ) as Promise<BossHelperAgentResponse<unknown>>
}

async function dismissProtocolNotice(page: Page) {
  const agreeButton = page.getByRole('button', { name: '了解并同意!' })
  const hasNotice = await agreeButton
    .waitFor({ state: 'visible', timeout: 1_500 })
    .then(() => true)
    .catch(() => false)

  if (!hasNotice) {
    return
  }

  await agreeButton.click()
  await expect(agreeButton).toBeHidden()
}

export async function waitForBossHelperReady(
  page: Page,
  options: {
    allowEmptyJobList?: boolean
  } = {},
) {
  await page.locator('#boss-helper').waitFor()
  await page.locator('#boss-helper-job').waitFor()
  await page.locator('#boss-helper-job-wrap').waitFor()
  const readTotalOnPage = async () => {
    const jobs = await callAgentCommand(page, 'jobs.list')
    return jobs.data && typeof jobs.data === 'object' && 'totalOnPage' in jobs.data
      ? Number((jobs.data as { totalOnPage?: number }).totalOnPage ?? 0)
      : null
  }

  if (options.allowEmptyJobList) {
    await expect.poll(readTotalOnPage).not.toBeNull()
  } else {
    await expect.poll(readTotalOnPage).toBeGreaterThan(0)
  }

  await dismissProtocolNotice(page)
}
