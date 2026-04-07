import {
  createBossHelperAgentResponse,
  type BossHelperAgentJobDetail,
  type BossHelperAgentJobDetailData,
  type BossHelperAgentJobDetailPayload,
  type BossHelperAgentJobPipelineStatus,
  type BossHelperAgentJobReviewPayload,
  type BossHelperAgentJobSummary,
  type BossHelperAgentJobsListData,
  type BossHelperAgentJobsListPayload,
  type BossHelperAgentLogEntry,
  type BossHelperAgentLogsQueryData,
  type BossHelperAgentLogsQueryPayload,
} from '@/message/agent'
import { jobList, type MyJobListData } from '@/stores/jobs'
import { useLog } from '@/stores/log'

import type { UseAgentQueriesOptions } from './agentQueryShared'
import { submitExternalAIFilterReview } from './agentReview'

function toAgentJobSummary(item: MyJobListData): BossHelperAgentJobSummary {
  return {
    encryptJobId: item.encryptJobId,
    jobName: item.jobName ?? '',
    brandName: item.brandName ?? '',
    brandScaleName: item.brandScaleName ?? '',
    salaryDesc: item.salaryDesc ?? '',
    cityName: item.cityName ?? '',
    areaDistrict: item.areaDistrict ?? '',
    skills: item.skills ?? [],
    jobLabels: item.jobLabels ?? [],
    bossName: item.bossName ?? '',
    bossTitle: item.bossTitle ?? '',
    goldHunter: item.goldHunter === 1,
    contact: Boolean(item.contact),
    welfareList: item.welfareList ?? [],
    status: item.status.status,
    statusMsg: item.status.msg ?? '',
    hasCard: Boolean(item.card),
  }
}

function toAgentJobDetail(item: MyJobListData, card: NonNullable<MyJobListData['card']>): BossHelperAgentJobDetail {
  return {
    ...toAgentJobSummary(item),
    postDescription: card.postDescription ?? card.jobInfo?.postDescription ?? '',
    salaryDesc: card.salaryDesc ?? card.jobInfo?.salaryDesc ?? item.salaryDesc ?? '',
    degreeName: card.degreeName ?? card.jobInfo?.degreeName ?? item.jobDegree ?? '',
    experienceName: card.experienceName ?? card.jobInfo?.experienceName ?? item.jobExperience ?? '',
    address: card.address ?? card.jobInfo?.address ?? '',
    jobLabels: card.jobLabels?.length ? card.jobLabels : card.jobInfo?.showSkills ?? item.jobLabels ?? [],
    bossName: card.bossName ?? card.bossInfo?.name ?? item.bossName ?? '',
    bossTitle: card.bossTitle ?? card.bossInfo?.title ?? item.bossTitle ?? '',
    activeTimeDesc: card.activeTimeDesc ?? card.bossInfo?.activeTimeDesc ?? '',
    friendStatus:
      typeof card.friendStatus === 'number'
        ? card.friendStatus
        : card.relationInfo?.beFriend
          ? 1
          : 0,
    brandName: card.brandName ?? card.brandComInfo?.brandName ?? item.brandName ?? '',
    brandIndustry: item.brandIndustry ?? card.brandComInfo?.industryName ?? '',
    welfareList: item.welfareList ?? [],
    skills: item.skills ?? [],
    gps:
      typeof card.jobInfo?.longitude === 'number' && typeof card.jobInfo?.latitude === 'number'
        ? {
            longitude: card.jobInfo.longitude,
            latitude: card.jobInfo.latitude,
          }
        : item.gps ?? null,
    hasCard: true,
  }
}

function normalizeJobStatusFilter(statusFilter?: BossHelperAgentJobPipelineStatus[]) {
  if (!statusFilter?.length) {
    return null
  }

  return new Set(statusFilter)
}

function getJobById(encryptJobId: string) {
  return jobList.get(encryptJobId) ?? jobList._list.value.find((item) => item.encryptJobId === encryptJobId)
}

function toAgentLogEntry(item: ReturnType<ReturnType<typeof useLog>['query']>['items'][number]): BossHelperAgentLogEntry {
  const aiFiltering = item.data?.aiFilteringAjson
  return {
    encryptJobId: item.job?.encryptJobId ?? '',
    jobName: item.job?.jobName ?? item.title ?? '',
    brandName: item.job?.brandName ?? '',
    status: item.state_name,
    message: item.message,
    error: item.data?.err,
    greeting: item.data?.aiGreetingA ?? item.data?.message,
    aiScore: aiFiltering,
    timestamp: item.createdAt,
  }
}

export function useAgentJobQueries(options: UseAgentQueriesOptions) {
  const log = useLog()

  async function jobsList(payload?: BossHelperAgentJobsListPayload) {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentJobsListData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }

    const statusFilter = normalizeJobStatusFilter(payload?.statusFilter)
    const allJobs = jobList._list.value
    const jobs = statusFilter
      ? allJobs.filter((item) => statusFilter.has(item.status.status))
      : allJobs

    return createBossHelperAgentResponse(true, 'jobs-list', '已返回当前职位列表', {
      jobs: jobs.map(toAgentJobSummary),
      total: jobs.length,
      totalOnPage: allJobs.length,
    })
  }

  async function logsQuery(payload?: BossHelperAgentLogsQueryPayload) {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentLogsQueryData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }

    const result = log.query(payload)
    return createBossHelperAgentResponse(true, 'logs-query', '已返回日志记录', {
      items: result.items.map(toAgentLogEntry),
      limit: result.limit,
      offset: result.offset,
      total: result.total,
    })
  }

  async function jobsReview(payload?: BossHelperAgentJobReviewPayload) {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return options.fail('unsupported-page', '当前页面不支持自动投递')
    }
    if (!payload?.encryptJobId) {
      return options.fail('missing-job-id', '缺少 encryptJobId')
    }

    const accepted = submitExternalAIFilterReview(payload)
    if (!accepted) {
      return options.fail('review-not-found', '当前没有匹配的待审核岗位')
    }

    return options.ok('review-submitted', '已接收外部审核结果')
  }

  async function jobsDetail(payload?: BossHelperAgentJobDetailPayload) {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentJobDetailData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }
    if (!payload?.encryptJobId) {
      return createBossHelperAgentResponse<BossHelperAgentJobDetailData>(
        false,
        'missing-job-id',
        '缺少 encryptJobId',
      )
    }

    const item = getJobById(payload.encryptJobId)
    if (!item) {
      return createBossHelperAgentResponse<BossHelperAgentJobDetailData>(
        false,
        'job-not-found',
        '当前页面未找到指定岗位',
      )
    }

    try {
      if (!item.card) {
        await item.getCard()
      }

      if (!item.card) {
        return createBossHelperAgentResponse<BossHelperAgentJobDetailData>(
          false,
          'job-detail-unavailable',
          '岗位详情暂不可用',
        )
      }

      return createBossHelperAgentResponse(true, 'job-detail', '已返回岗位详情', {
        job: toAgentJobDetail(item, item.card),
      })
    } catch (error) {
      return createBossHelperAgentResponse<BossHelperAgentJobDetailData>(
        false,
        'job-detail-load-failed',
        error instanceof Error ? error.message : '岗位详情加载失败',
      )
    }
  }

  return {
    jobsList,
    logsQuery,
    jobsReview,
    jobsDetail,
  }
}