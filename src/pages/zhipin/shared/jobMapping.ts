import type {
  BossHelperAgentCurrentJob,
  BossHelperAgentJobDetail,
  BossHelperAgentJobSummary,
} from '@/message/agent'
import type { MyJobListData } from '@/stores/jobs'
import type { logData } from '@/stores/log'
import type { Statistics } from '@/types/formData'

export function createDailyStatisticsSnapshot(date: string): Statistics {
  return {
    date,
    success: 0,
    total: 0,
    company: 0,
    jobTitle: 0,
    jobContent: 0,
    aiFiltering: 0,
    hrPosition: 0,
    salaryRange: 0,
    companySizeRange: 0,
    activityFilter: 0,
    goldHunterFilter: 0,
    repeat: 0,
    jobAddress: 0,
    amap: 0,
    aiRequestCount: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    aiTotalTokens: 0,
    aiTotalCost: 0,
  }
}

export function toAgentCurrentJob(
  data:
    | Pick<MyJobListData, 'brandName' | 'encryptJobId' | 'jobName' | 'status'>
    | {
        brandName?: string | null
        encryptJobId: string
        jobName?: string | null
        message?: string | null
        status?: string | null
      }
    | null
    | undefined,
): BossHelperAgentCurrentJob | null {
  if (!data) {
    return null
  }

  if ('status' in data && data.status != null && typeof data.status === 'object') {
    return {
      encryptJobId: data.encryptJobId,
      jobName: data.jobName ?? '',
      brandName: data.brandName ?? '',
      status: data.status.status,
      message: data.status.msg ?? '',
    }
  }

  return {
    encryptJobId: data.encryptJobId,
    jobName: data.jobName ?? '',
    brandName: data.brandName ?? '',
    status: typeof data.status === 'string' ? data.status : '',
    message: 'message' in data ? (data.message ?? '') : '',
  }
}

export function toAgentJobSummary(item: MyJobListData): BossHelperAgentJobSummary {
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

export function toAgentJobDetail(
  item: MyJobListData,
  card: NonNullable<MyJobListData['card']>,
): BossHelperAgentJobDetail {
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

export function toPendingReviewDetail(ctx: logData, threshold: number, timeoutMs: number) {
  return {
    encryptJobId: ctx.listData.encryptJobId,
    threshold,
    timeoutMs,
    job: {
      ...toAgentJobSummary(ctx.listData),
      degreeName: ctx.listData.card?.degreeName ?? '',
      experienceName: ctx.listData.card?.experienceName ?? '',
      address: ctx.listData.card?.address ?? '',
      activeTimeDesc: ctx.listData.card?.activeTimeDesc ?? '',
      postDescription: ctx.listData.card?.postDescription ?? '',
    },
  }
}

export function resetJobStatuses(
  jobs: readonly MyJobListData[],
  shouldReset: (job: MyJobListData) => boolean = () => true,
) {
  jobs.forEach((job) => {
    if (!shouldReset(job)) {
      return
    }

    switch (job.status.status) {
      case 'success':
      case 'warn':
        break
      case 'pending':
      case 'wait':
      case 'running':
      case 'error':
      default:
        job.status.setStatus('wait', '等待中')
    }
  })
}
