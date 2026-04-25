import { miTem } from 'mitem'

import { useModel } from '@/composables/useModel'
import { sendChatByGeekChatCore } from '@/composables/useWebSocket/chatCore'
import { requestExternalAIFilterReview } from '@/pages/zhipin/hooks/agentReview'
import { useConf } from '@/stores/conf'
import { useStatistics } from '@/stores/statistics'
import { useUser } from '@/stores/user'
import { AIFilteringError, GreetError } from '@/types/deliverError'
import type { Statistics, FormData } from '@/types/formData'

import { runInternalAIGreeting } from './services/aiGreeting'
import { runInternalAIFiltering } from './services/aiFiltering'
import {
  createActivityFilterStep,
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
import type { StepFactory } from './type'
import { errorHandle, sameCompanyKey, sameHrKey } from './utils'
import { requestBossData } from './utils'

export interface ApplyingHandleOptions {
  currentUserId?: number | string | null
  formData?: FormData
  getModelStore?: () => ReturnType<typeof useModel>
  requestExternalReview?: typeof requestExternalAIFilterReview
  statistics?: { todayData: Statistics }
}

export function handles(options: ApplyingHandleOptions = {}) {
  const toCause = (error: unknown) => (error instanceof Error ? { cause: error } : undefined)
  const conf = useConf()
  const formData = options.formData ?? conf.formData
  const statistics = options.statistics ?? useStatistics()
  const getModelStore = () => options.getModelStore?.() ?? useModel()
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

  const customGreeting: StepFactory = () => {
    const useCustomGreeting = formData.customGreeting.enable
    const useAiGreeting = formData.aiGreeting.enable

    if (!useCustomGreeting && !useAiGreeting) {
      return
    }

    const template = useCustomGreeting ? miTem.compile(formData.customGreeting.value) : undefined

    return {
      after: async ({ data }, ctx) => {
        try {
          const uid = useUser().getUserId()
          if (uid == null || uid === '') {
            throw new GreetError('没有获取到uid')
          }

          const card = data.card ?? (await data.getCard())
          if (card == null) {
            throw new GreetError('Card 信息获取失败')
          }

          ctx.bossData ??= await requestBossData(card)

          const message = useAiGreeting
            ? await (async () => {
                const model = getModelStore()
                const curModel = model.modelData.find((v) => formData.aiGreeting.model === v.key)
                if (!curModel) {
                  throw new GreetError('没有找到AI打招呼的模型')
                }

                return runInternalAIGreeting({
                  card,
                  ctx,
                  gpt: model.getModel(curModel, formData.aiGreeting.prompt),
                  model: curModel,
                  onPrompt: () => {},
                })
              })()
            : (
                formData.greetingVariable.value && template
                  ? template({
                      data,
                      boss: ctx.bossData,
                      card,
                      amap: {
                        straightDistance: 0,
                        drivingDistance: 0,
                        drivingDuration: 0,
                        walkingDistance: 0,
                        walkingDuration: 0,
                      },
                    })
                  : formData.customGreeting.value
              ).trim()

          if (!message) {
            throw new GreetError('打招呼内容为空')
          }

          ctx.message = message

          await sendChatByGeekChatCore({
            form_uid: String(uid),
            to_uid: String(ctx.bossData.data.bossId),
            to_name: ctx.bossData.data.encryptBossId,
            friend_source: ctx.bossData.data.bossSource,
            content: message,
          })
        } catch (e) {
          if (e instanceof GreetError) {
            throw e
          }
          throw new GreetError(errorHandle(e), toCause(e))
        }
      },
    }
  }

  const aiFiltering: StepFactory = () => {
    if (!formData.aiFiltering.enable) {
      return
    }
    const model = getModelStore()
    const curModel = model.modelData.find((v) => formData.aiFiltering.model === v.key)
    const requiresInternalModel = formData.aiFiltering.externalMode !== true
    if (requiresInternalModel && !curModel) {
      throw new AIFilteringError('没有找到AI筛选的模型')
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
            negative: review.negative ?? [],
            positive: review.positive ?? [],
            rating,
            reason,
            source: 'external',
            threshold,
          }

          if (!review.accepted) {
            throw new AIFilteringError(reason, {
              accepted: false,
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
          ctx,
          gpt: model.getModel(curModel, formData.aiFiltering.prompt),
          model: curModel,
          onPrompt: () => {},
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
    customGreeting,
  }
}
