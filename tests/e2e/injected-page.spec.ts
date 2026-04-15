import { expect, test } from '@playwright/test'
import type {
  BossHelperAgentConfigUpdateData,
  BossHelperAgentJobCurrentData,
  BossHelperAgentJobDetailData,
  BossHelperAgentJobsListData,
  BossHelperAgentLogsQueryData,
  BossHelperAgentStatsData,
  BossHelperAgentResponse,
} from '../../src/message/agent'

import {
  callAgentCommand,
  getOrCreatePage,
  launchExtensionSession,
  waitForBossHelperReady,
} from './helpers/extension'
import {
  fixtureJobId,
  fulfillFixtureJson,
  registerZhipinFixtureRoutes,
} from './helpers/zhipin-fixture'

async function prepareReadyBossPage(options?: Parameters<typeof registerZhipinFixtureRoutes>[1]) {
  const session = await launchExtensionSession()
  await registerZhipinFixtureRoutes(session.context, options)
  const page = await getOrCreatePage(session.context)
  await page.goto('https://www.zhipin.com/web/geek/jobs')
  await waitForBossHelperReady(page)
  return { page, session }
}

async function applyStableConfig(page: import('@playwright/test').Page) {
  const configUpdate = await callAgentCommand(page, 'config.update', {
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
  }) as BossHelperAgentResponse<BossHelperAgentConfigUpdateData>

  expect(configUpdate).toEqual(
    expect.objectContaining({
      code: 'config-updated',
      ok: true,
    }),
  )
}

async function startTargetedApply(page: import('@playwright/test').Page) {
  return callAgentCommand(page, 'start', {
    confirmHighRisk: true,
    jobIds: [fixtureJobId],
    resetFiltered: true,
  }) as Promise<BossHelperAgentResponse>
}

test('loads the extension on a Boss jobs page and completes a targeted apply flow', async () => {
  const { page, session } = await prepareReadyBossPage()

  try {
    await expect(page.locator('#boss-helper-job-wrap')).toBeVisible()
    await expect(page.locator('#boss-helper-job')).toContainText('Helper')

    const initialJobs = await callAgentCommand(page, 'jobs.list') as BossHelperAgentResponse<BossHelperAgentJobsListData>

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

    const jobDetail = await callAgentCommand(page, 'jobs.detail', {
      encryptJobId: fixtureJobId,
    }) as BossHelperAgentResponse<BossHelperAgentJobDetailData>

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

    const currentJob = await callAgentCommand(page, 'jobs.current') as BossHelperAgentResponse<BossHelperAgentJobCurrentData>
    expect(currentJob).toEqual(
      expect.objectContaining({
        code: 'jobs-current',
        ok: true,
      }),
    )
    expect(currentJob?.data).toEqual(
      expect.objectContaining({
        selected: true,
        job: expect.objectContaining({
          encryptJobId: fixtureJobId,
          postDescription: '负责前端页面开发',
          hasCard: true,
        }),
      }),
    )

    await applyStableConfig(page)

    const start = await startTargetedApply(page)

    expect(start).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    await expect.poll(async () => {
      const jobs = await callAgentCommand(page, 'jobs.list') as BossHelperAgentResponse<BossHelperAgentJobsListData>
      return jobs.data?.jobs.find((item) => item.encryptJobId === fixtureJobId)?.status
    }).toBe('success')

    const completedJobs = await callAgentCommand(page, 'jobs.list') as BossHelperAgentResponse<BossHelperAgentJobsListData>

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

test('marks the job as failed when apply hits a network error', async () => {
  const { page, session } = await prepareReadyBossPage({
    onApply: async (route) => {
      await route.abort('failed')
    },
  })

  try {
    await applyStableConfig(page)

    const start = await startTargetedApply(page)
    expect(start).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    await expect.poll(async () => {
      const jobs = await callAgentCommand(page, 'jobs.list') as BossHelperAgentResponse<BossHelperAgentJobsListData>
      return jobs.data?.jobs.find((item) => item.encryptJobId === fixtureJobId)?.status
    }).toBe('error')

    const completedJobs = await callAgentCommand(page, 'jobs.list') as BossHelperAgentResponse<BossHelperAgentJobsListData>

    expect(completedJobs?.data?.jobs).toEqual([
      expect.objectContaining({
        encryptJobId: fixtureJobId,
        status: 'error',
        statusMsg: '投递出错',
      }),
    ])

    const logs = await callAgentCommand(page, 'logs.query', {
      status: ['投递出错'],
    }) as BossHelperAgentResponse<BossHelperAgentLogsQueryData>

    expect(logs?.data?.items[0]).toEqual(
      expect.objectContaining({
        encryptJobId: fixtureJobId,
        error: 'Network Error',
        status: '投递出错',
      }),
    )
  } finally {
    await session.cleanup()
  }
})

test('marks the job as failed when apply returns HTTP 429', async () => {
  const { page, session } = await prepareReadyBossPage({
    onApply: async (route) => {
      await fulfillFixtureJson(route, {
        status: 429,
        body: {
          code: 429,
          message: 'Too Many Requests',
          zpData: {},
        },
      })
    },
  })

  try {
    await applyStableConfig(page)

    const start = await startTargetedApply(page)
    expect(start).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    await expect.poll(async () => {
      const jobs = await callAgentCommand(page, 'jobs.list') as BossHelperAgentResponse<BossHelperAgentJobsListData>
      return jobs.data?.jobs.find((item) => item.encryptJobId === fixtureJobId)?.status
    }).toBe('error')

    const logs = await callAgentCommand(page, 'logs.query', {
      status: ['投递出错'],
    }) as BossHelperAgentResponse<BossHelperAgentLogsQueryData>

    expect(logs).toEqual(
      expect.objectContaining({
        code: 'logs-query',
        ok: true,
      }),
    )
    expect(logs?.data?.items[0]).toEqual(
      expect.objectContaining({
        encryptJobId: fixtureJobId,
        error: expect.stringContaining('429'),
        status: '投递出错',
      }),
    )
  } finally {
    await session.cleanup()
  }
})

test('rejects a second start while the current delivery is already running', async () => {
  const { page, session } = await prepareReadyBossPage({
    onApply: async (route) => {
      await page.waitForTimeout(300)
      await fulfillFixtureJson(route, {
        body: {
          code: 0,
          message: 'ok',
          zpData: {
            encryptJobId: fixtureJobId,
          },
        },
      })
    },
  })

  try {
    await applyStableConfig(page)

    const firstStart = await startTargetedApply(page)
    expect(firstStart).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    await expect.poll(async () => {
      const stats = await callAgentCommand(page, 'stats') as BossHelperAgentResponse<BossHelperAgentStatsData>
      return stats?.data?.progress?.state
    }).toBe('running')

    const secondStart = await startTargetedApply(page)
    expect(secondStart).toEqual(
      expect.objectContaining({
        code: 'already-running',
        message: '当前已有进行中的投递任务',
        ok: false,
      }),
    )

    await expect.poll(async () => {
      const jobs = await callAgentCommand(page, 'jobs.list') as BossHelperAgentResponse<BossHelperAgentJobsListData>
      return jobs.data?.jobs.find((item) => item.encryptJobId === fixtureJobId)?.status
    }).toBe('success')
  } finally {
    await session.cleanup()
  }
})

test('accepts navigate requests and reinitializes the injected agent on the destination page', async () => {
  const { page, session } = await prepareReadyBossPage()

  try {
    const response = await callAgentCommand(page, 'navigate', {
      page: 2,
      query: 'frontend',
    }) as BossHelperAgentResponse<{ targetUrl: string }>

    expect(response).toEqual(
      expect.objectContaining({
        code: 'navigate-accepted',
        ok: true,
      }),
    )
    expect(response?.data?.targetUrl).toContain('page=2')
    expect(response?.data?.targetUrl).toContain('query=frontend')

    await page.waitForURL('https://www.zhipin.com/web/geek/jobs?query=frontend&page=2')
    await waitForBossHelperReady(page)

    const jobs = await callAgentCommand(page, 'jobs.list') as BossHelperAgentResponse<BossHelperAgentJobsListData>

    expect(jobs).toEqual(
      expect.objectContaining({
        code: 'jobs-list',
        ok: true,
      }),
    )
    expect(jobs?.data?.jobs).toEqual([
      expect.objectContaining({
        encryptJobId: fixtureJobId,
        jobName: 'Frontend Engineer',
      }),
    ])
  } finally {
    await session.cleanup()
  }
})
