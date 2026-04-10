import {
  createBossHelperAgentResponse,
  type BossHelperAgentJobDetailData,
  type BossHelperAgentJobDetailPayload,
  type BossHelperAgentJobPipelineStatus,
  type BossHelperAgentJobReviewPayload,
  type BossHelperAgentJobsListData,
  type BossHelperAgentJobsListPayload,
  type BossHelperAgentLogEntry,
  type BossHelperAgentLogsQueryData,
  type BossHelperAgentLogsQueryPayload,
} from '@/message/agent'
import { jobList } from '@/stores/jobs'
import { useLog } from '@/stores/log'

import type { UseAgentQueriesOptions } from './agentQueryShared'
import { submitExternalAIFilterReview } from './agentReview'
import { toAgentJobDetail, toAgentJobSummary } from '../shared/jobMapping'

function normalizeJobStatusFilter(statusFilter?: BossHelperAgentJobPipelineStatus[]) {
  if (!statusFilter?.length) {
    return null
  }

  return new Set(statusFilter)
}

function getJobById(encryptJobId: string) {
  return jobList.get(encryptJobId) ?? jobList.list.find((item) => item.encryptJobId === encryptJobId)
}

function toAgentLogEntry(item: ReturnType<ReturnType<typeof useLog>['query']>['items'][number]): BossHelperAgentLogEntry {
  const aiFiltering = item.data?.aiFilteringAjson
  const pipelineError = item.data?.pipelineError ? { ...item.data.pipelineError } : undefined
  return {
    encryptJobId: item.job?.encryptJobId ?? '',
    jobName: item.job?.jobName ?? item.title ?? '',
    brandName: item.job?.brandName ?? '',
    status: item.state_name,
    message: item.message,
    error: item.data?.err,
    greeting: item.data?.aiGreetingA ?? item.data?.message,
    aiScore: aiFiltering,
    pipelineError,
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
    const allJobs = jobList.list
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
