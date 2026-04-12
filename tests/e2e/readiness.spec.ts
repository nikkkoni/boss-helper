import { expect, test } from '@playwright/test'
import type {
  BossHelperAgentReadinessData,
  BossHelperAgentResponse,
} from '../../src/message/agent'

import {
  expectRelayConnected,
  pickAvailablePort,
  runAgentCli,
  startAgentBridge,
} from './helpers/agent-bridge'
import {
  callAgentCommand,
  getOrCreatePage,
  launchExtensionSession,
  waitForBossHelperReady,
} from './helpers/extension'
import { registerZhipinFixtureRoutes } from './helpers/zhipin-fixture'

async function readPageReadiness(page: import('@playwright/test').Page) {
  return callAgentCommand(page, 'readiness.get') as Promise<
    BossHelperAgentResponse<BossHelperAgentReadinessData>
  >
}

async function readBridgeReadiness(port: number) {
  const result = await runAgentCli<BossHelperAgentResponse<BossHelperAgentReadinessData>>({
    command: 'readiness.get',
    port,
  })

  return result.data
}

test('verifies readiness snapshots through Playwright, relay and CLI', async () => {
  const session = await launchExtensionSession()
  const bridgePort = await pickAvailablePort(4717)
  const bridge = await startAgentBridge(bridgePort)

  try {
    await registerZhipinFixtureRoutes(session.context)

    const jobsPage = await getOrCreatePage(session.context)
    await jobsPage.goto('https://www.zhipin.com/web/geek/jobs')
    await waitForBossHelperReady(jobsPage)

    const relayPage = await session.context.newPage()
    await relayPage.goto(`${bridge.httpsBaseUrl}/?extensionId=${session.extensionId}`)
    await expectRelayConnected(relayPage, bridge)
    await jobsPage.bringToFront()

    const directReady = await readPageReadiness(jobsPage)
    expect(directReady).toEqual(
      expect.objectContaining({
        code: 'readiness',
        ok: true,
        data: expect.objectContaining({
          ready: true,
          suggestedAction: 'continue',
          page: expect.objectContaining({
            controllable: true,
            routeKind: 'jobs',
            supported: true,
          }),
          extension: expect.objectContaining({
            initialized: true,
          }),
        }),
      }),
    )

    const cliReady = await readBridgeReadiness(bridge.port)
    expect(cliReady).toEqual(
      expect.objectContaining({
        code: 'readiness',
        ok: true,
        data: expect.objectContaining({
          ready: true,
          suggestedAction: 'continue',
          page: expect.objectContaining({
            controllable: true,
            routeKind: 'jobs',
            supported: true,
          }),
          account: expect.objectContaining({
            loginRequired: false,
          }),
        }),
      }),
    )

    await jobsPage.evaluate(() => {
      const loginDialog = document.createElement('div')
      loginDialog.setAttribute('role', 'dialog')
      loginDialog.dataset.testid = 'boss-helper-playwright-login'
      loginDialog.textContent = '请先登录后继续'
      loginDialog.style.display = 'block'
      loginDialog.style.visibility = 'visible'
      loginDialog.style.opacity = '1'
      document.body.appendChild(loginDialog)
    })

    const loginRequired = await readBridgeReadiness(bridge.port)
    expect(loginRequired).toEqual(
      expect.objectContaining({
        code: 'readiness',
        ok: true,
        data: expect.objectContaining({
          ready: false,
          suggestedAction: 'wait-login',
          account: expect.objectContaining({
            loggedIn: false,
            loginRequired: true,
          }),
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: 'login-required' }),
          ]),
        }),
      }),
    )

    await jobsPage.evaluate(() => {
      document.querySelector('[data-testid="boss-helper-playwright-login"]')?.remove()

      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.dataset.testid = 'boss-helper-playwright-dialog'
      dialog.textContent = '请完成安全验证'
      dialog.style.display = 'block'
      dialog.style.visibility = 'visible'
      dialog.style.opacity = '1'
      document.body.appendChild(dialog)
    })

    const captchaBlocked = await readBridgeReadiness(bridge.port)
    expect(captchaBlocked).toEqual(
      expect.objectContaining({
        code: 'readiness',
        ok: true,
        data: expect.objectContaining({
          ready: false,
          suggestedAction: 'stop',
          risk: expect.objectContaining({
            hasBlockingModal: true,
            hasCaptcha: true,
          }),
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: 'captcha-required' }),
            expect.objectContaining({ code: 'blocking-modal' }),
          ]),
        }),
      }),
    )

    await expect(relayPage.locator('#logs')).toContainText('收到命令 readiness.get')
  } finally {
    await bridge.stop()
    await session.cleanup()
  }
})