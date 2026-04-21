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
  const worker = page.context().serviceWorkers()[0] ?? await page.context().waitForEvent('serviceworker')
  return worker.evaluate(
    async ({ command, pageUrl, payload }) => {
      const tabs = await chrome.tabs.query({ url: ['*://zhipin.com/*', '*://*.zhipin.com/*'] })
      const target = tabs.find((tab) => tab.url === pageUrl) ?? tabs.find((tab) => tab.active) ?? tabs[0]
      if (!target?.id) {
        throw new Error(`agent bridge timeout: ${command}`)
      }

      return chrome.tabs.sendMessage(target.id, {
        channel: '__boss_helper_agent__',
        command,
        ...(payload === undefined ? {} : { payload }),
        requestId: `e2e-${Math.random().toString(36).slice(2)}`,
      })
    },
    { command, pageUrl: page.url(), payload },
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
