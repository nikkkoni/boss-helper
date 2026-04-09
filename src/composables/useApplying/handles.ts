import { ElMessage } from 'element-plus'

import { useModel } from '@/composables/useModel'
import { useStatistics } from '@/composables/useStatistics'
import { requestExternalAIFilterReview } from '@/pages/zhipin/hooks/agentReview'
import { useConf } from '@/stores/conf'
import {
  AIFilteringError,
} from '@/types/deliverError'

import { SignedKeyLLM } from '../useModel/signedKey'
import { runInternalAIFiltering, warmSignedKeyResume } from './services/aiFiltering'
import { buildAmapPrompt } from './services/amapStep'
import { useChatPromptBridge } from './services/chatPrompt'
import {
  createActivityFilterStep,
  createAmapStep,
  createCommunicatedStep,
  createCompanySizeRangeStep,
  createCompanyStep,
  createDuplicateFilter,
  createGoldHunterFilterStep,
  createHrPositionStep,
  createJobAddressStep,
  createJobContentStep,
  createJobFriendStatusStep,
  createJobTitleStep,
  createSalaryRangeStep,
  getCurrentApplyingUserId,
} from './services/filterSteps'
import {
  composeGreetingStep,
  createAIGreetingStep,
  createCustomGreetingStep,
  createExternalGreetingStep,
} from './services/greetingSteps'
import type { StepFactory } from './type'
import {
  errorHandle,
  sameCompanyKey,
  sameHrKey,
} from './utils'

export function handles() {
  const toCause = (error: unknown) => (error instanceof Error ? { cause: error } : undefined)
  const { chatBossMessage } = useChatPromptBridge()
  const model = useModel()
  const conf = useConf()
  const statistics = useStatistics()

  const currentUserId = getCurrentApplyingUserId()
  const communicated = createCommunicatedStep(statistics)
  const SameCompanyFilter = createDuplicateFilter({
    enabled: () => conf.formData.sameCompanyFilter.value,
    storageKey: sameCompanyKey,
    getId: (data) => data.encryptBrandId,
    errorMessage: '相同公司已投递',
    statistics,
    userId: currentUserId,
  })
  const SameHrFilter = createDuplicateFilter({
    enabled: () => conf.formData.sameHrFilter.value,
    storageKey: sameHrKey,
    getId: (data) => data.encryptBossId,
    errorMessage: '相同hr已投递',
    statistics,
    userId: currentUserId,
  })
  const jobTitle = createJobTitleStep(conf.formData, statistics, toCause)
  const goldHunterFilter = createGoldHunterFilterStep(conf.formData, statistics)
  const company = createCompanyStep(conf.formData, statistics, toCause)
  const salaryRange = createSalaryRangeStep(conf.formData, statistics, toCause)
  const companySizeRange = createCompanySizeRangeStep(conf.formData, statistics, toCause)
  const jobContent = createJobContentStep(conf.formData, statistics, toCause)
  const hrPosition = createHrPositionStep(conf.formData, statistics, toCause)
  const jobAddress = createJobAddressStep(conf.formData, statistics, toCause)
  const jobFriendStatus = createJobFriendStatusStep(conf.formData)
  const activityFilter = createActivityFilterStep(conf.formData, statistics, toCause)
  const amap = createAmapStep(conf.formData)

  const aiFiltering: StepFactory = () => {
    if (!conf.formData.aiFiltering.enable) {
      return
    }
    const curModel = model.modelData.find((v) => conf.formData.aiFiltering.model === v.key)
    if (!curModel && !conf.formData.aiFiltering.vip) {
      throw new AIFilteringError('没有找到AI筛选的模型')
    }
    const gpt = model.getModel(
      curModel,
      conf.formData.aiFiltering.prompt,
      conf.formData.aiFiltering.vip,
    )
    if (gpt instanceof SignedKeyLLM) {
      warmSignedKeyResume(gpt, 'aiFiltering')
    }
    return async (_, ctx) => {
      // const chatInput = chatInputInit(model)
      try {
        const threshold = conf.formData.aiFiltering.score ?? 10
        if (conf.formData.aiFiltering.externalMode) {
          const review = await requestExternalAIFilterReview(
            ctx,
            threshold,
            conf.formData.aiFiltering.externalTimeoutMs ?? 120000,
          )
          const rating = typeof review.rating === 'number' ? review.rating : undefined
          const reason = review.reason?.trim() || (review.accepted ? '外部审核通过' : '外部审核未通过')

          ctx.aiFilteringAjson = {
            positive: review.positive ?? [],
            negative: review.negative ?? [],
            accepted: review.accepted,
            source: 'external',
            reason,
          }
          ctx.aiFilteringAtext = `分数${rating ?? '未提供'}\n结论:${reason}\n阈值:${threshold}`
          ctx.aiFilteringScore = {
            accepted: review.accepted,
            greeting: review.greeting,
            negative: review.negative ?? [],
            positive: review.positive ?? [],
            rating,
            reason,
            source: 'external',
            threshold,
          }
          if (review.greeting) {
            ctx.externalGreeting = review.greeting
            ctx.message = review.greeting
          }

          if (!review.accepted) {
            throw new AIFilteringError(reason, {
              accepted: false,
              greeting: review.greeting,
              negative: review.negative ?? [],
              positive: review.positive ?? [],
              rating,
              reason,
              source: 'external',
              threshold,
            })
          }

          return
        }

        await runInternalAIFiltering({
          amapPrompt: buildAmapPrompt(ctx, conf.formData.amap.enable),
          ctx,
          gpt,
          model: curModel,
          onPrompt: (s) => chatBossMessage(ctx, s),
          threshold,
        })
      } catch (e) {
        statistics.todayData.aiFiltering++
        // chatInput.end('Err~')
        if (e instanceof AIFilteringError) {
          throw e
        }
        throw new AIFilteringError(errorHandle(e), ctx.aiFilteringScore as any, toCause(e))
      }
    }
  }

  const aiGreeting: StepFactory = () => {
    const curModel = model.modelData.find((v) => conf.formData.aiGreeting.model === v.key)
    if (!curModel && !conf.formData.aiGreeting.vip) {
      ElMessage.warning('没有找到招呼语的模型')
      return
    }
    return createAIGreetingStep({
      getModel: () => model.getModel(
        curModel,
        conf.formData.aiGreeting.prompt,
        conf.formData.aiGreeting.vip,
      ),
      model: curModel,
      onPrompt: chatBossMessage,
    })()
  }

  const greeting: StepFactory = () => {
    const externalGreetingAfter = createExternalGreetingStep()
    const base = conf.formData.aiGreeting.enable
      ? aiGreeting()
      : conf.formData.customGreeting.enable
        ? createCustomGreetingStep({
            template: conf.formData.customGreeting.value,
            useVariables: conf.formData.greetingVariable.value,
          })()
        : undefined

    return composeGreetingStep(base, externalGreetingAfter)
  }

  return {
    communicated,
    SameCompanyFilter,
    SameHrFilter,
    jobTitle,
    goldHunterFilter,
    company,
    salaryRange,
    companySizeRange,
    jobContent,
    hrPosition,
    jobAddress,
    jobFriendStatus,
    aiFiltering,
    activityFilter,
    greeting,
    amap,
  }
}
