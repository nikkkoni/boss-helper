import { ElMessage } from 'element-plus'

import { useModel } from '@/composables/useModel'
import { requestExternalAIFilterReview } from '@/pages/zhipin/hooks/agentReview'
import { useConf } from '@/stores/conf'
import type { logData } from '@/stores/log'
import { useStatistics } from '@/stores/statistics'
import type { Statistics, FormData } from '@/types/formData'
import { AIFilteringError } from '@/types/deliverError'

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
import { errorHandle, sameCompanyKey, sameHrKey } from './utils'

export interface ApplyingHandleOptions {
  currentUserId?: number | string | null
  formData?: FormData
  getModelStore?: () => ReturnType<typeof useModel>
  onChatPrompt?: (ctx: logData, s: string) => void
  requestExternalReview?: typeof requestExternalAIFilterReview
  statistics?: { todayData: Statistics }
}

export function handles(options: ApplyingHandleOptions = {}) {
  const toCause = (error: unknown) => (error instanceof Error ? { cause: error } : undefined)
  const conf = useConf()
  const formData = options.formData ?? conf.formData
  const statistics = options.statistics ?? useStatistics()
  const getModelStore = () => options.getModelStore?.() ?? useModel()
  const getChatBossMessage = () => options.onChatPrompt ?? useChatPromptBridge().chatBossMessage
  const requestExternalReview = options.requestExternalReview ?? requestExternalAIFilterReview

  const currentUserId = options.currentUserId ?? getCurrentApplyingUserId()
  const communicated = createCommunicatedStep(statistics)
  const SameCompanyFilter = createDuplicateFilter({
    enabled: () => formData.sameCompanyFilter.value,
    storageKey: sameCompanyKey,
    getId: (data) => data.encryptBrandId,
    errorMessage: '相同公司已投递',
    statistics,
    userId: currentUserId,
  })
  const SameHrFilter = createDuplicateFilter({
    enabled: () => formData.sameHrFilter.value,
    storageKey: sameHrKey,
    getId: (data) => data.encryptBossId,
    errorMessage: '相同hr已投递',
    statistics,
    userId: currentUserId,
  })
  const jobTitle = createJobTitleStep(formData, statistics, toCause)
  const goldHunterFilter = createGoldHunterFilterStep(formData, statistics)
  const company = createCompanyStep(formData, statistics, toCause)
  const salaryRange = createSalaryRangeStep(formData, statistics, toCause)
  const companySizeRange = createCompanySizeRangeStep(formData, statistics, toCause)
  const jobContent = createJobContentStep(formData, statistics, toCause)
  const hrPosition = createHrPositionStep(formData, statistics, toCause)
  const jobAddress = createJobAddressStep(formData, statistics, toCause)
  const jobFriendStatus = createJobFriendStatusStep(formData)
  const activityFilter = createActivityFilterStep(formData, statistics, toCause)
  const amap = createAmapStep(formData)

  const aiFiltering: StepFactory = () => {
    if (!formData.aiFiltering.enable) {
      return
    }
    const model = getModelStore()
    const curModel = model.modelData.find((v) => conf.formData.aiFiltering.model === v.key)
    if (!curModel && !formData.aiFiltering.vip) {
      throw new AIFilteringError('没有找到AI筛选的模型')
    }
    const gpt = model.getModel(
      curModel,
      formData.aiFiltering.prompt,
      formData.aiFiltering.vip,
    )
    if (gpt instanceof SignedKeyLLM) {
      warmSignedKeyResume(gpt, 'aiFiltering')
    }
    return async (_, ctx) => {
      // const chatInput = chatInputInit(model)
      try {
        const threshold = formData.aiFiltering.score ?? 10
        if (formData.aiFiltering.externalMode) {
          const review = await requestExternalReview(
            ctx,
            threshold,
            formData.aiFiltering.externalTimeoutMs ?? 120000,
          )
          const rating = typeof review.rating === 'number' ? review.rating : undefined
          const reason =
            review.reason?.trim() || (review.accepted ? '外部审核通过' : '外部审核未通过')

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
          amapPrompt: buildAmapPrompt(ctx, formData.amap.enable),
          ctx,
          gpt,
          model: curModel,
          onPrompt: (s) => getChatBossMessage()(ctx, s),
          threshold,
        })
      } catch (e) {
        statistics.todayData.aiFiltering++
        // chatInput.end('Err~')
        if (e instanceof AIFilteringError) {
          throw e
        }
        throw new AIFilteringError(errorHandle(e), ctx.aiFilteringScore, toCause(e))
      }
    }
  }

  const aiGreeting: StepFactory = () => {
    const model = getModelStore()
    const curModel = model.modelData.find((v) => conf.formData.aiGreeting.model === v.key)
    if (!curModel && !formData.aiGreeting.vip) {
      ElMessage.warning('没有找到招呼语的模型')
      return
    }
    return createAIGreetingStep({
      getModel: () =>
        model.getModel(curModel, formData.aiGreeting.prompt, formData.aiGreeting.vip),
      model: curModel,
      onPrompt: getChatBossMessage(),
    })()
  }

  const greeting: StepFactory = () => {
    const externalGreetingAfter = createExternalGreetingStep()
    const base = formData.aiGreeting.enable
      ? aiGreeting()
      : formData.customGreeting.enable
        ? createCustomGreetingStep({
            template: formData.customGreeting.value,
            useVariables: formData.greetingVariable.value,
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
