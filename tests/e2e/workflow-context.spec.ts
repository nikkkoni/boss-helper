import { expect, test } from '@playwright/test'

import { createWorkflowDriver } from './helpers/workflow-driver'
import { fixtureJobDetails, fixtureJobList } from './helpers/zhipin-fixture'

function createZhipinJobCard(detail: Record<string, any>) {
  return {
    ...detail,
    jobName: detail.jobInfo.jobName,
    postDescription: detail.jobInfo.postDescription,
    encryptJobId: detail.jobInfo.encryptId,
    atsDirectPost: false,
    atsProxyJob: detail.jobInfo.proxyJob === 1,
    salaryDesc: detail.jobInfo.salaryDesc,
    cityName: detail.jobInfo.locationName,
    experienceName: detail.jobInfo.experienceName,
    degreeName: detail.jobInfo.degreeName,
    jobLabels: detail.jobInfo.showSkills || [],
    address: detail.jobInfo.address,
    lid: detail.lid,
    sessionId: detail.sessionId || '',
    securityId: detail.securityId,
    encryptUserId: detail.jobInfo.encryptUserId,
    bossName: detail.bossInfo.name,
    bossTitle: detail.bossInfo.title,
    bossAvatar: detail.bossInfo.tiny,
    online: detail.bossInfo.bossOnline,
    certificated: detail.bossInfo.certificated,
    activeTimeDesc: detail.bossInfo.activeTimeDesc,
    brandName: detail.brandComInfo.brandName,
    canAddFriend: true,
    friendStatus: 0,
    isInterested: detail.relationInfo.interestJob ? 1 : 0,
    login: true,
  }
}

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
  const detail = structuredClone(fixtureJobDetails.job_1 ?? fixtureJobDetails['job-1'] ?? fixtureJobDetails[fixtureJobList[0].encryptJobId]) as Record<string, any>
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

function createSecondFixtureJobWithCard(detail: Record<string, any>) {
  return {
    ...createSecondFixtureJob(),
    card: createZhipinJobCard(detail),
  }
}

test('surfaces context-refresh workflow when the chain is ready but no jobs are visible', async () => {
  const driver = await createWorkflowDriver({
    allowEmptyJobList: true,
    clientName: 'playwright-workflow-context-refresh',
    fixtureOptions: {
      jobList: [],
    },
    preferredBridgePort: 4817,
  })

  try {
    const context = await driver.readAgentContext({
      include: ['readiness', 'events', 'stats'],
    })

    expect(context.summary).toEqual(
      expect.objectContaining({
        currentRunId: null,
        hasActiveRun: false,
        jobsVisibleCount: 0,
        pendingReviewCount: 0,
        recentRunState: null,
        resumableRun: false,
      }),
    )
    expect(context.workflow).toEqual(
      expect.objectContaining({
        stage: 'context-refresh',
        goal: '继续补齐当前可执行上下文',
        candidateFocus: null,
        eventFocus: null,
        planFocus: null,
        recommendedTools: expect.arrayContaining([
          'boss_helper_agent_context',
          'boss_helper_jobs_list',
          'boss_helper_resume_get',
          'boss_helper_navigate',
        ]),
      }),
    )
  } finally {
    await driver.cleanup()
  }
})

test('surfaces analyze-jobs workflow with candidateFocus and scoped planFocus through MCP', async () => {
  const driver = await createWorkflowDriver({
    clientName: 'playwright-workflow-analyze-jobs',
    preferredBridgePort: 4837,
  })

  try {
    await driver.primeJobDetail('job-1')

    const context = await driver.readAgentContext({
      include: ['readiness', 'jobs', 'plan', 'resume', 'stats'],
    })

    expect(context.summary).toEqual(
      expect.objectContaining({
        currentRunId: null,
        hasActiveRun: false,
        jobsVisibleCount: 1,
        pendingReviewCount: 0,
        recentRunState: null,
        resumableRun: false,
      }),
    )
    expect(context.workflow).toEqual(
      expect.objectContaining({
        stage: 'analyze-jobs',
        goal: '先做小范围岗位分析与只读预演',
        candidateFocus: {
          inspectFirst: [
            expect.objectContaining({
              encryptJobId: 'job-1',
              hasCard: true,
              jobName: 'Frontend Engineer',
              reason: 'loaded-card',
            }),
          ],
          loadedCardCount: 1,
          visibleCount: 1,
        },
        planFocus: {
          firstAction: 'refresh-candidates',
          inspectFirst: [
            expect.objectContaining({
              decision: 'skip',
              encryptJobId: 'job-1',
              jobName: 'Frontend Engineer',
              stage: 'current-status',
            }),
          ],
          scope: {
            source: 'selected-current-job',
            targetJobIds: ['job-1'],
          },
          summary: expect.objectContaining({
            readyCount: 0,
            scopedCount: 1,
            skipCount: 1,
          }),
        },
        recommendedTools: expect.arrayContaining([
          'boss_helper_agent_context',
          'boss_helper_jobs_current',
          'boss_helper_jobs_list',
          'boss_helper_jobs_detail',
          'boss_helper_resume_get',
          'boss_helper_plan_preview',
        ]),
      }),
    )
    expect(context.sections?.plan).toEqual(
      expect.objectContaining({
        scope: {
          source: 'selected-current-job',
          targetJobIds: ['job-1'],
        },
        data: expect.objectContaining({
          config: expect.objectContaining({
            targetJobIds: ['job-1'],
          }),
          summary: expect.objectContaining({
            readyCount: 0,
            scopedCount: 1,
            skipCount: 1,
          }),
        }),
      }),
    )
  } finally {
    await driver.cleanup()
  }
})

test('surfaces analyze-jobs candidate-focus fallback when no current job is selected', async () => {
  const secondJobDetail = createSecondFixtureJobDetail()
  const secondJob = createSecondFixtureJobWithCard(secondJobDetail)
  const driver = await createWorkflowDriver({
    clientName: 'playwright-workflow-candidate-focus',
    fixtureOptions: {
      jobDetails: {
        ...structuredClone(fixtureJobDetails),
        [secondJob.encryptJobId]: secondJobDetail,
      },
      jobList: [structuredClone(fixtureJobList[0]), secondJob],
      selectedJobId: null,
    },
    preferredBridgePort: 4857,
  })

  try {
    const context = await driver.readAgentContext({
      include: ['readiness', 'jobs', 'plan', 'resume', 'stats'],
    })

    expect(context.workflow).toEqual(
      expect.objectContaining({
        stage: 'analyze-jobs',
        candidateFocus: {
          inspectFirst: [
            expect.objectContaining({
              encryptJobId: secondJob.encryptJobId,
              hasCard: true,
              jobName: secondJob.jobName,
              reason: 'loaded-card',
            }),
            expect.objectContaining({
              encryptJobId: 'job-1',
              hasCard: false,
              jobName: 'Frontend Engineer',
              reason: 'list-order',
            }),
          ],
          loadedCardCount: 1,
          visibleCount: 2,
        },
        planFocus: {
          firstAction: 'refresh-candidates',
          inspectFirst: [
            expect.objectContaining({
              decision: 'skip',
              encryptJobId: 'job-1',
              jobName: 'Frontend Engineer',
              stage: 'current-status',
            }),
            expect.objectContaining({
              decision: 'skip',
              encryptJobId: secondJob.encryptJobId,
              jobName: secondJob.jobName,
              stage: 'current-status',
            }),
          ],
          scope: {
            source: 'candidate-focus',
            targetJobIds: [secondJob.encryptJobId, 'job-1'],
          },
          summary: expect.objectContaining({
            readyCount: 0,
            scopedCount: 2,
            skipCount: 2,
          }),
        },
      }),
    )
    expect(context.sections?.plan).toEqual(
      expect.objectContaining({
        scope: {
          source: 'candidate-focus',
          targetJobIds: [secondJob.encryptJobId, 'job-1'],
        },
      }),
    )
  } finally {
    await driver.cleanup()
  }
})

test('keeps page-default plan scope when no jobs are visible but plan preview is still requested directly', async () => {
  const driver = await createWorkflowDriver({
    allowEmptyJobList: true,
    clientName: 'playwright-workflow-page-default-plan',
    fixtureOptions: {
      jobList: [],
      selectedJobId: null,
    },
    preferredBridgePort: 4877,
  })

  try {
    const context = await driver.readAgentContext({
      include: ['readiness', 'jobs', 'plan', 'stats'],
    })

    expect(context.workflow).toEqual(
      expect.objectContaining({
        stage: 'context-refresh',
        planFocus: {
          firstAction: 're-read-context',
          inspectFirst: [],
          scope: {
            source: 'page-default',
            targetJobIds: [],
          },
          summary: expect.objectContaining({
            readyCount: 0,
            scopedCount: 0,
            skipCount: 0,
          }),
        },
      }),
    )
    expect(context.sections?.plan).toEqual(
      expect.objectContaining({
        scope: {
          source: 'page-default',
          targetJobIds: [],
        },
        data: expect.objectContaining({
          summary: expect.objectContaining({
            readyCount: 0,
            scopedCount: 0,
            skipCount: 0,
            totalOnPage: 0,
          }),
        }),
      }),
    )
  } finally {
    await driver.cleanup()
  }
})
