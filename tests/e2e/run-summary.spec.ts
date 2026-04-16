import { expect, test } from '@playwright/test'

import { createWorkflowDriver } from './helpers/workflow-driver'
import {
  fixtureJobDetails,
  fixtureJobId,
  fixtureJobList,
  fulfillFixtureJson,
} from './helpers/zhipin-fixture'

function createSecondFixtureJob() {
  const job = structuredClone(fixtureJobList[0])
  return {
    ...job,
    areaDistrict: '徐汇区',
    bossName: 'Bob',
    brandName: 'Beta',
    encryptBossId: 'boss-2',
    encryptBrandId: 'brand-2',
    encryptJobId: 'job-2',
    itemId: 2,
    jobName: 'Platform Engineer',
    lid: 'lid-2',
    salaryDesc: '25-35K',
    securityId: 'security-2',
  }
}

function createSecondFixtureJobDetail() {
  const detail = structuredClone(fixtureJobDetails[fixtureJobId]) as Record<string, any>
  return {
    ...detail,
    bossInfo: {
      ...detail.bossInfo,
      brandName: 'Beta',
      name: 'Bob',
      title: '招聘顾问',
    },
    brandComInfo: {
      ...detail.brandComInfo,
      customerBrandName: 'Beta',
      encryptBrandId: 'brand-2',
      brandName: 'Beta',
    },
    jobInfo: {
      ...detail.jobInfo,
      address: '上海市徐汇区漕河泾',
      encryptAddressId: 'address-2',
      encryptId: 'job-2',
      encryptUserId: 'boss-user-2',
      jobName: 'Platform Engineer',
      positionName: 'Platform Engineer',
      salaryDesc: '25-35K',
      showSkills: ['Vue', 'Node.js'],
    },
    lid: 'lid-2',
    securityId: 'security-2',
  }
}

test('surfaces paused and completed run summaries through CLI stats and MCP context', async () => {
  let applyCount = 0
  const secondJob = createSecondFixtureJob()
  const secondJobDetail = createSecondFixtureJobDetail()
  const driver = await createWorkflowDriver({
    clientName: 'playwright-run-summary-paused',
    fixtureOptions: {
      jobDetails: {
        ...structuredClone(fixtureJobDetails),
        [secondJob.encryptJobId]: secondJobDetail,
      },
      jobList: [structuredClone(fixtureJobList[0]), secondJob],
      onApply: async (route) => {
        applyCount += 1
        if (applyCount === 1) {
          await new Promise((resolve) => {
            setTimeout(resolve, 1_000)
          })
        }

        await fulfillFixtureJson(route, {
          body: {
            code: 0,
            message: 'ok',
            zpData: {
              attempt: applyCount,
            },
          },
        })
      },
    },
    preferredBridgePort: 4757,
  })

  try {
    const start = await driver.prepareObserveRun({
      jobIds: [fixtureJobId, secondJob.encryptJobId],
      resetFiltered: true,
      timeout: 10_000,
    })
    expect(start).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    const runningContext = await driver.readAgentContext()
    expect(runningContext.workflow).toEqual(
      expect.objectContaining({
        stage: 'observe-run',
        eventFocus: {
          terminalTypes: ['limit-reached', 'batch-error', 'batch-completed'],
          watchTypes: [
            'job-pending-review',
            'limit-reached',
            'batch-error',
            'batch-completed',
            'rate-limited',
            'job-failed',
            'job-succeeded',
            'job-filtered',
            'chat-sent',
          ],
        },
        goal: '优先观察进行中的 run',
        recommendedTools: expect.arrayContaining([
          'boss_helper_stats',
          'boss_helper_events_recent',
          'boss_helper_wait_for_event',
          'boss_helper_run_report',
        ]),
      }),
    )

    const { pause, stats: pausedStats } = await driver.pauseRunAndWaitPaused({ timeout: 10_000 })
    expect(pause).toEqual(
      expect.objectContaining({
        code: 'pause-requested',
        ok: true,
        data: expect.objectContaining({
          progress: expect.objectContaining({
            state: 'pausing',
          }),
          run: expect.objectContaining({
            current: expect.objectContaining({
              state: 'pausing',
            }),
          }),
        }),
      }),
    )

    const pausedRun = pausedStats.data?.run.current
    expect(pausedStats).toEqual(
      expect.objectContaining({
        code: 'stats',
        ok: true,
      }),
    )
    expect(pausedRun).toEqual(
      expect.objectContaining({
        processedJobIds: [fixtureJobId],
        recovery: expect.objectContaining({
          resumable: true,
          suggestedAction: 'resume',
        }),
        remainingTargetJobIds: [secondJob.encryptJobId],
        state: 'paused',
      }),
    )
    expect(pausedRun?.runId).toEqual(expect.any(String))

    const pausedContext = await driver.readAgentContext()
    expect(pausedContext.summary).toEqual(
      expect.objectContaining({
        currentRunId: pausedRun?.runId,
        hasActiveRun: true,
        recentRunState: 'paused',
        resumableRun: true,
      }),
    )
    expect(pausedContext.sections?.stats?.data?.run.current).toEqual(
      expect.objectContaining({
        runId: pausedRun?.runId,
        state: 'paused',
      }),
    )
    expect(pausedContext.workflow).toEqual(
      expect.objectContaining({
        stage: 'resume-run',
        goal: '判断是否安全恢复当前 paused run',
        recommendedTools: expect.arrayContaining([
          'boss_helper_stats',
          'boss_helper_run_report',
          'boss_helper_resume',
          'boss_helper_stop',
        ]),
      }),
    )

    const pausedReport = await driver.readRunReport()
    expect(pausedReport.run).toEqual(
      expect.objectContaining({
        runId: pausedRun?.runId,
        state: 'paused',
      }),
    )
    expect(pausedReport.summary).toEqual(
      expect.objectContaining({
        scope: 'current',
        selectedRunId: pausedRun?.runId,
        selectedRunState: 'paused',
      }),
    )
    expect(pausedReport.summary?.decisionLogCount).toBeGreaterThan(0)
    expect((pausedReport.summary?.categoryCounts?.execution ?? 0)).toBeGreaterThan(0)
    expect((pausedReport.summary?.outcomeCounts?.delivered ?? 0)).toBeGreaterThan(0)
    expect(pausedReport.decisionLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'execution',
          outcome: 'delivered',
          source: 'event',
        }),
      ]),
    )

    const { resume, stats: completedStats } = await driver.resumeRunAndWaitCompleted({ timeout: 10_000 })
    expect(resume).toEqual(
      expect.objectContaining({
        code: 'resumed',
        ok: true,
      }),
    )

    expect(completedStats.data?.run.current).toBeNull()
    expect(completedStats.data?.run.recent).toEqual(
      expect.objectContaining({
        processedJobIds: [fixtureJobId, secondJob.encryptJobId],
        recovery: expect.objectContaining({
          resumable: false,
          suggestedAction: 'continue',
        }),
        runId: pausedRun?.runId,
        state: 'completed',
      }),
    )

    const completedContext = await driver.readAgentContext()
    expect(completedContext.summary).toEqual(
      expect.objectContaining({
        currentRunId: null,
        hasActiveRun: false,
        recentRunState: 'completed',
        resumableRun: false,
      }),
    )
    expect(completedContext.sections?.stats?.data?.run.recent).toEqual(
      expect.objectContaining({
        runId: pausedRun?.runId,
        state: 'completed',
      }),
    )

    const completedReport = await driver.readRunReport()
    expect(completedReport.run).toEqual(
      expect.objectContaining({
        runId: pausedRun?.runId,
        state: 'completed',
      }),
    )
    expect(completedReport.summary).toEqual(
      expect.objectContaining({
        scope: 'recent',
        selectedRunId: pausedRun?.runId,
        selectedRunState: 'completed',
      }),
    )
    expect((completedReport.summary?.categoryCounts?.execution ?? 0)).toBeGreaterThan(0)
    expect((completedReport.summary?.outcomeCounts?.delivered ?? 0)).toBeGreaterThanOrEqual(2)
    expect(completedReport.decisionLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'execution',
          outcome: 'delivered',
          source: 'log',
        }),
        expect.objectContaining({
          reference: expect.objectContaining({
            eventType: 'batch-completed',
          }),
          source: 'event',
        }),
      ]),
    )
  } finally {
    await driver.cleanup()
  }
})

test('surfaces batch-error run summaries with refresh-page recovery hints', async () => {
  const driver = await createWorkflowDriver({
    clientName: 'playwright-run-summary-error',
    preferredBridgePort: 4777,
  })

  try {
    const { start, stats: errorStats } = await driver.prepareErrorRun({
      jobIds: [fixtureJobId],
      resetFiltered: true,
      timeout: 10_000,
    })

    expect(start).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )

    expect(errorStats.data?.run.current).toBeNull()
    expect(errorStats.data?.run.recent).toEqual(
      expect.objectContaining({
        lastError: expect.objectContaining({
          message: expect.any(String),
        }),
        recovery: expect.objectContaining({
          requiresPageReload: true,
          resumable: false,
          suggestedAction: 'refresh-page',
        }),
        state: 'error',
      }),
    )

    const errorContext = await driver.readAgentContext()
    expect(errorContext.summary).toEqual(
      expect.objectContaining({
        currentRunId: null,
        hasActiveRun: false,
        recentRunState: 'error',
        resumableRun: false,
      }),
    )
    expect(errorContext.sections?.stats?.data?.run.recent).toEqual(
      expect.objectContaining({
        recovery: expect.objectContaining({
          suggestedAction: 'refresh-page',
        }),
        state: 'error',
      }),
    )
    expect(errorContext.workflow).toEqual(
      expect.objectContaining({
        stage: 'recover-error',
        goal: '先定位上一轮错误，再决定是否继续',
        recommendedTools: expect.arrayContaining([
          'boss_helper_run_report',
          'boss_helper_stats',
          'boss_helper_jobs_refresh',
        ]),
      }),
    )
    expect(errorContext.recommendations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('刷新页面'),
      ]),
    )

    const errorReport = await driver.readRunReport()
    expect(errorReport.run).toEqual(
      expect.objectContaining({
        state: 'error',
      }),
    )
    expect(errorReport.summary).toEqual(
      expect.objectContaining({
        scope: 'recent',
        selectedRunState: 'error',
      }),
    )
    expect(errorReport.summary?.decisionLogCount).toBeGreaterThan(0)
    expect((errorReport.summary?.categoryCounts?.execution ?? 0)).toBeGreaterThan(0)
    expect((errorReport.summary?.outcomeCounts?.failed ?? 0)).toBeGreaterThan(0)
    expect(errorReport.decisionLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reasonCode: 'batch-error',
          source: 'event',
        }),
      ]),
    )
  } finally {
    await driver.cleanup()
  }
})

test('surfaces pending-review audit details through MCP run report before a run is stopped', async () => {
  let applyCount = 0
  const driver = await createWorkflowDriver({
    clientName: 'playwright-run-report-pending-review',
    fixtureOptions: {
      onApply: async (route) => {
        applyCount += 1
        await new Promise((resolve) => {
          setTimeout(resolve, 10_000)
        })
        await fulfillFixtureJson(route, {
          body: {
            code: 0,
            message: 'ok',
            zpData: {
              attempt: applyCount,
            },
          },
        })
      },
    },
    preferredBridgePort: 4797,
  })

  try {
    const { event, start, syntheticEvent } = await driver.preparePendingReviewRun({
      event: {
        detail: {
          encryptJobId: fixtureJobId,
          job: {
            encryptJobId: fixtureJobId,
            jobName: 'Frontend Engineer',
            brandName: 'Acme',
          },
          threshold: 60,
          timeoutMs: 60_000,
        },
        id: 'pending-review-e2e',
        job: {
          brandName: 'Acme',
          encryptJobId: fixtureJobId,
          jobName: 'Frontend Engineer',
        },
        message: '等待外部审核: Frontend Engineer',
        type: 'job-pending-review',
      },
      jobIds: [fixtureJobId],
      resetFiltered: true,
      timeout: 15_000,
    })

    expect(start).toEqual(
      expect.objectContaining({
        code: 'started',
        ok: true,
      }),
    )
    expect(syntheticEvent).toEqual(
      expect.objectContaining({
        ok: true,
        body: expect.objectContaining({
          accepted: true,
          ok: true,
        }),
      }),
    )

    const pendingContext = await driver.readAgentContext({
      include: ['events', 'stats'],
    })
    expect(pendingContext.workflow).toEqual(
      expect.objectContaining({
        stage: 'review-loop',
        eventFocus: {
          terminalTypes: ['limit-reached', 'batch-error', 'batch-completed'],
          watchTypes: ['job-pending-review', 'limit-reached', 'batch-error', 'batch-completed'],
        },
        goal: '优先完成待审核闭环',
        recommendedTools: expect.arrayContaining([
          'boss_helper_jobs_detail',
          'boss_helper_resume_get',
          'boss_helper_jobs_review',
        ]),
      }),
    )

    const pendingReport = await driver.readRunReport()
    expect(pendingReport.run).toEqual(
      expect.objectContaining({
        state: 'running',
      }),
    )
    expect(pendingReport.summary).toEqual(
      expect.objectContaining({
        scope: 'current',
        pendingReviewCount: 1,
        selectedRunState: 'running',
      }),
    )
    expect((pendingReport.summary?.categoryCounts?.business ?? 0)).toBeGreaterThan(0)
    expect((pendingReport.summary?.outcomeCounts?.info ?? 0)).toBeGreaterThan(0)
    expect(pendingReport.reviewAudit).toEqual(
      expect.objectContaining({
        externalReviewCount: 0,
        pendingReviewCount: 1,
        pendingReviewEvents: [
          expect.objectContaining({
            encryptJobId: fixtureJobId,
            timestamp: event.createdAt,
          }),
        ],
      }),
    )
    expect(pendingReport.decisionLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'business',
          outcome: 'info',
          reasonCode: 'external-review-required',
          reference: expect.objectContaining({
            eventType: 'job-pending-review',
          }),
          source: 'event',
        }),
      ]),
    )

    const stop = await driver.stopRun()
    expect(stop).toEqual(
      expect.objectContaining({
        code: 'stopped',
        ok: true,
      }),
    )
    await driver.waitForRecentRunState('stopped', { timeout: 15_000 })
  } finally {
    await driver.cleanup()
  }
})
