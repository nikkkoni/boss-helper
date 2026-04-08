import { expect, test } from '@playwright/test'
import type {
  BossHelperAgentConfigUpdateData,
  BossHelperAgentJobDetailData,
  BossHelperAgentJobsListData,
  BossHelperAgentResponse,
} from '../../src/message/agent'

import { getOrCreatePage, launchExtensionSession, waitForBossHelperReady } from './helpers/extension'
import { fixtureJobId, registerZhipinFixtureRoutes } from './helpers/zhipin-fixture'

test('loads the extension on a Boss jobs page and completes a targeted apply flow', async () => {
  const session = await launchExtensionSession()

  try {
    await registerZhipinFixtureRoutes(session.context)
    const page = await getOrCreatePage(session.context)
    await page.goto('https://www.zhipin.com/web/geek/jobs')

    await waitForBossHelperReady(page)

    await expect(page.locator('#boss-helper-job-warp')).toBeVisible()
    await expect(page.locator('#boss-helper-job')).toContainText('Helper')

    const initialJobs = (await page.evaluate(async () => {
      return window.__bossHelperAgent?.jobsList()
    })) as BossHelperAgentResponse<BossHelperAgentJobsListData> | undefined

    expect(initialJobs).toEqual(
      expect.objectContaining({
        code: 'jobs-list',
        ok: true,
      }),
    )
    expect(initialJobs?.data?.jobs).toEqual([
      expect.objectContaining({
        encryptJobId: fixtureJobId,
        jobName: 'Frontend Engineer',
        status: 'pending',
      }),
    ])

    const jobDetail = (await page.evaluate(async (encryptJobId) => {
      return window.__bossHelperAgent?.jobsDetail({ encryptJobId })
    }, fixtureJobId)) as BossHelperAgentResponse<BossHelperAgentJobDetailData> | undefined

    expect(jobDetail).toEqual(
      expect.objectContaining({
        code: 'job-detail',
        ok: true,
      }),
    )
    expect(jobDetail?.data?.job).toEqual(
      expect.objectContaining({
        encryptJobId: fixtureJobId,
        postDescription: '负责前端页面开发',
      }),
    )

    const configUpdate = (await page.evaluate(async () => {
      return window.__bossHelperAgent?.configUpdate({
        configPatch: {
          delay: {
            deliveryStarts: 0,
            deliveryInterval: 0,
            deliveryPageNext: 0,
            messageSending: 0,
          },
          notification: {
            value: false,
          },
          sameHrFilter: {
            value: false,
          },
        },
      })
    })) as BossHelperAgentResponse<BossHelperAgentConfigUpdateData> | undefined

    expect(configUpdate).toEqual(
      expect.objectContaining({
        code: 'config-updated',
        ok: true,
      }),
    )

    const start = (await page.evaluate(async (encryptJobId) => {
      return window.__bossHelperAgent?.start({
        jobIds: [encryptJobId],
        resetFiltered: true,
      })
    }, fixtureJobId)) as BossHelperAgentResponse | undefined

    expect(start).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    await page.waitForFunction((encryptJobId) => {
      const jobList = window.__q_jobList as {
        list?: Array<{
          encryptJobId: string
          status: { status: string }
        }>
      } | undefined
      return jobList?.list?.some(
        (item) => item.encryptJobId === encryptJobId && item.status.status === 'success',
      )
    }, fixtureJobId)

    const completedJobs = (await page.evaluate(async () => {
      return window.__bossHelperAgent?.jobsList()
    })) as BossHelperAgentResponse<BossHelperAgentJobsListData> | undefined

    expect(completedJobs?.data?.jobs).toEqual([
      expect.objectContaining({
        encryptJobId: fixtureJobId,
        status: 'success',
        statusMsg: '投递成功',
      }),
    ])
  } finally {
    await session.cleanup()
  }
})
