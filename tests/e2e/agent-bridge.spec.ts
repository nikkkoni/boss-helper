import { expect, test } from '@playwright/test'
import type {
  BossHelperAgentJobsListData,
  BossHelperAgentResponse,
  BossHelperAgentStatsData,
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
import { fixtureJobId, registerZhipinFixtureRoutes } from './helpers/zhipin-fixture'

test('routes CLI commands through the relay page into the extension controller', async () => {
  const session = await launchExtensionSession()
  const bridgePort = await pickAvailablePort()
  const bridge = await startAgentBridge(bridgePort)

  try {
    await registerZhipinFixtureRoutes(session.context)

    const jobsPage = await getOrCreatePage(session.context)
    await jobsPage.goto('https://www.zhipin.com/web/geek/jobs')
    await waitForBossHelperReady(jobsPage)

    const relayPage = await session.context.newPage()
    await relayPage.goto(`${bridge.httpsBaseUrl}/?extensionId=${session.extensionId}`)
    await expectRelayConnected(relayPage, bridge)

    const configUpdate = await runAgentCli<BossHelperAgentResponse>({
      command: 'config.update',
      payload: {
        configPatch: {
          delay: {
            deliveryStarts: 0,
            deliveryInterval: 0,
            deliveryPageNext: 0,
          },
          notification: {
            value: false,
          },
          sameHrFilter: {
            value: false,
          },
        },
      },
      port: bridge.port,
    })

    expect(configUpdate.data).toEqual(
      expect.objectContaining({
        code: 'config-updated',
        ok: true,
      }),
    )

    const stats = await runAgentCli<BossHelperAgentResponse<BossHelperAgentStatsData>>({
      command: 'stats',
      port: bridge.port,
    })

    expect(stats.data).toEqual(
      expect.objectContaining({
        code: 'stats',
        ok: true,
      }),
    )
    expect(stats.data.data?.progress?.state).toBe('idle')

    const jobsList = await runAgentCli<BossHelperAgentResponse<BossHelperAgentJobsListData>>({
      command: 'jobs.list',
      port: bridge.port,
    })

    expect(jobsList.data.data?.jobs).toEqual([
      expect.objectContaining({
        encryptJobId: fixtureJobId,
        jobName: 'Frontend Engineer',
      }),
    ])

    const start = await runAgentCli<BossHelperAgentResponse>({
      command: 'start',
      payload: {
        confirmHighRisk: true,
        jobIds: [fixtureJobId],
        resetFiltered: true,
      },
      port: bridge.port,
    })

    expect(start.data).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    await expect.poll(async () => {
      const jobs = await callAgentCommand(jobsPage, 'jobs.list') as BossHelperAgentResponse<BossHelperAgentJobsListData>
      return jobs.data?.jobs.find((item) => item.encryptJobId === fixtureJobId)?.status
    }).toBe('success')

    await expect(relayPage.locator('#logs')).toContainText('收到实时事件 job-started')
    await expect(relayPage.locator('#logs')).toContainText('收到实时事件 batch-completed')

    const completedJobs = await runAgentCli<BossHelperAgentResponse<BossHelperAgentJobsListData>>({
      command: 'jobs.list',
      port: bridge.port,
    })

    expect(completedJobs.data.data?.jobs).toEqual([
      expect.objectContaining({
        encryptJobId: fixtureJobId,
        status: 'success',
        statusMsg: '投递成功',
      }),
    ])
  } finally {
    await bridge.stop()
    await session.cleanup()
  }
})

test('blocks external start when configPatch contains removed delivery-only fields', async () => {
  const session = await launchExtensionSession()
  const bridgePort = await pickAvailablePort()
  const bridge = await startAgentBridge(bridgePort)

  try {
    await registerZhipinFixtureRoutes(session.context)

    const jobsPage = await getOrCreatePage(session.context)
    await jobsPage.goto('https://www.zhipin.com/web/geek/jobs')
    await waitForBossHelperReady(jobsPage)

    const relayPage = await session.context.newPage()
    await relayPage.goto(`${bridge.httpsBaseUrl}/?extensionId=${session.extensionId}`)
    await expectRelayConnected(relayPage, bridge)

    const blockedStart = await runAgentCli<BossHelperAgentResponse<BossHelperAgentStatsData>>({
      allowFailure: true,
      command: 'start',
      payload: {
        confirmHighRisk: false,
        configPatch: {
          customGreeting: {
            enable: true,
            value: 'fresh build validation verification',
          },
        },
        jobIds: [fixtureJobId],
      },
      port: bridge.port,
    })

    expect(blockedStart.data).toEqual(
      expect.objectContaining({
        code: 'validation-failed',
        ok: false,
        retryable: false,
        suggestedAction: 'fix-input',
      }),
    )

    await expect(relayPage.locator('#logs')).not.toContainText('收到实时事件 batch-started')

    const jobsList = await runAgentCli<BossHelperAgentResponse<BossHelperAgentJobsListData>>({
      command: 'jobs.list',
      port: bridge.port,
    })

    expect(jobsList.data.data?.jobs).toEqual([
      expect.objectContaining({
        encryptJobId: fixtureJobId,
        status: 'pending',
      }),
    ])
  } finally {
    await bridge.stop()
    await session.cleanup()
  }
})
