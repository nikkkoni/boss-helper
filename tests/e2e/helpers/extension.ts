import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type BrowserContext, type Page } from '@playwright/test'

type PageJobListState = {
  list?: Array<{
    encryptJobId: string
    status: {
      status: string
    }
  }>
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

export async function waitForBossHelperReady(page: Page) {
  await page.locator('#boss-helper').waitFor()
  await page.locator('#boss-helper-job').waitFor()
  await page.waitForFunction(() => {
    const jobList = window.__q_jobList as PageJobListState | undefined
    return Boolean(
      window.__bossHelperAgent
      && jobList?.list?.length
      && document.querySelector('#boss-helper-job-warp')
    )
  })
}
