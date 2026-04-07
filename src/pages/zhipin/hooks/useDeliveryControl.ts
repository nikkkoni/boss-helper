import { ElMessage } from 'element-plus'

import { useChat } from '@/composables/useChat'
import { useCommon } from '@/composables/useCommon'
import { useStatistics } from '@/composables/useStatistics'
import { Message } from '@/composables/useWebSocket'
import {
  BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
  BOSS_HELPER_AGENT_EVENT_BRIDGE,
  type BossHelperAgentChatHistoryData,
  type BossHelperAgentChatHistoryPayload,
  type BossHelperAgentChatListData,
  type BossHelperAgentChatListPayload,
  type BossHelperAgentChatMessage,
  type BossHelperAgentChatSendPayload,
  type BossHelperAgentConfigUpdateData,
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
  type BossHelperAgentNavigateData,
  type BossHelperAgentNavigatePayload,
  type BossHelperAgentValidationError,
  createBossHelperAgentResponse,
  isBossHelperAgentBridgeRequest,
  isBossHelperSupportedJobUrl,
  type BossHelperAgentState,
  type BossHelperAgentConfigSnapshot,
  type BossHelperAgentConfigUpdatePayload,
  type BossHelperAgentController,
  type BossHelperAgentCurrentJob,
  type BossHelperAgentRequest,
  type BossHelperAgentResponse,
  type BossHelperAgentResumeData,
  type BossHelperAgentStartPayload,
  type BossHelperAgentStatsData,
} from '@/message/agent'
import { useConf } from '@/stores/conf'
import { validateConfigPatch } from '@/stores/conf/validation'
import { jobList, type MyJobListData } from '@/stores/jobs'
import { useLog } from '@/stores/log'
import { useUser } from '@/stores/user'
import { delay, notification } from '@/utils'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

import { abortAllPendingAIFilterReviews, submitExternalAIFilterReview } from './agentReview'
import { createBossHelperAgentEvent, emitBossHelperAgentEvent, onBossHelperAgentEvent } from './agentEvents'
import { useDeliver } from './useDeliver'
import { usePager } from './usePager'

let batchPromise: Promise<void> | null = null
let activeTargetJobIds: string[] = []
let remainingTargetJobIds: string[] = []
let stopRequestedByCommand = false

function normalizeTargetJobIds(jobIds?: string[]) {
  if (!jobIds?.length) {
    return []
  }

  return [...new Set(jobIds.map((id) => id.trim()).filter(Boolean))]
}

function currentJobSnapshot(currentData: ReturnType<typeof useDeliver>['currentData']) {
  if (!currentData) return null

  const snapshot: BossHelperAgentCurrentJob = {
    encryptJobId: currentData.encryptJobId,
    jobName: currentData.jobName ?? '',
    brandName: currentData.brandName ?? '',
    status: currentData.status.status,
    message: currentData.status.msg ?? '',
  }

  return snapshot
}

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

function buildNavigateUrl(payload?: BossHelperAgentNavigatePayload) {
  if (payload?.url) {
    const targetUrl = new URL(payload.url, location.origin)
    if (!isBossHelperSupportedJobUrl(targetUrl.toString())) {
      throw new Error('navigate.url 必须指向 Boss 职位搜索页')
    }
    return targetUrl.toString()
  }

  const targetUrl = new URL(location.href)
  if (payload?.query != null) {
    if (payload.query.trim()) {
      targetUrl.searchParams.set('query', payload.query.trim())
    } else {
      targetUrl.searchParams.delete('query')
    }
  }
  if (payload?.city != null) {
    if (payload.city.trim()) {
      targetUrl.searchParams.set('city', payload.city.trim())
    } else {
      targetUrl.searchParams.delete('city')
    }
  }
  if (payload?.position != null) {
    if (payload.position.trim()) {
      targetUrl.searchParams.set('position', payload.position.trim())
    } else {
      targetUrl.searchParams.delete('position')
    }
  }
  if (payload?.page != null) {
    if (!Number.isInteger(payload.page) || payload.page < 1) {
      throw new Error('navigate.page 必须是大于等于 1 的整数')
    }
    if (payload.page === 1) {
      targetUrl.searchParams.delete('page')
    } else {
      targetUrl.searchParams.set('page', String(payload.page))
    }
  }

  return targetUrl.toString()
}

function toAgentChatMessage(conversationId: string, item: ReturnType<typeof useChat>['chatMessages']['value'][number]): BossHelperAgentChatMessage {
  return {
    conversationId,
    id: item.id,
    role: item.role,
    name: item.name,
    content: item.content,
    timestamp: `${item.date[0]} ${item.date[1]}`,
  }
}

export function useDeliveryControl() {
  const chat = useChat()
  const log = useLog()
  const statistics = useStatistics()
  const common = useCommon()
  const deliver = useDeliver()
  const { next, page } = usePager()
  const conf = useConf()

  function currentProgressSnapshot() {
    return {
      activeTargetJobIds: [...activeTargetJobIds],
      current: deliver.total > 0 ? Math.min(deliver.current + 1, deliver.total) : 0,
      currentJob: currentJobSnapshot(deliver.currentData),
      locked: common.deliverLock,
      message: common.deliverStatusMessage,
      page: page.page,
      pageSize: page.pageSize,
      remainingTargetJobIds: [...remainingTargetJobIds],
      state: common.deliverState,
      stopRequested: common.deliverStop,
      total: deliver.total,
    }
  }

  function setDeliverState(state: BossHelperAgentState, message: string) {
    const previousState = common.deliverState
    const previousMessage = common.deliverStatusMessage
    common.deliverState = state
    common.deliverStatusMessage = message

    if (previousState !== state || previousMessage !== message) {
      emitBossHelperAgentEvent(
        createBossHelperAgentEvent({
          type: 'state-changed',
          state,
          message,
          progress: currentProgressSnapshot(),
        }),
      )
    }
  }

  async function ensureStoresLoaded() {
    if (!conf.isLoaded) {
      await conf.confInit()
    }
  }

  function clearTargetJobState() {
    activeTargetJobIds = []
    remainingTargetJobIds = []
  }

  async function applyStartPayload(payload?: BossHelperAgentStartPayload) {
    const targetJobIds = normalizeTargetJobIds(payload?.jobIds)
    activeTargetJobIds = [...targetJobIds]
    remainingTargetJobIds = [...targetJobIds]

    if (payload?.configPatch && Object.keys(payload.configPatch).length > 0) {
      await conf.applyRuntimeConfigPatch(payload.configPatch, {
        persist: payload.persistConfig,
      })
    }

    if (payload?.resetFiltered) {
      if (targetJobIds.length === 0) {
        resetFilter()
      }
    }
  }

  async function getStatsData(): Promise<BossHelperAgentStatsData> {
    await statistics.updateStatistics()

    return {
      progress: {
        activeTargetJobIds: [...activeTargetJobIds],
        state: common.deliverState,
        locked: common.deliverLock,
        stopRequested: common.deliverStop,
        page: page.page,
        pageSize: page.pageSize,
        total: deliver.total,
        current: deliver.total > 0 ? Math.min(deliver.current + 1, deliver.total) : 0,
        message: common.deliverStatusMessage,
        currentJob: currentJobSnapshot(deliver.currentData),
        remainingTargetJobIds: [...remainingTargetJobIds],
      },
      todayData: jsonClone(statistics.todayData),
      historyData: jsonClone(statistics.statisticsData),
    }
  }

  async function ok(code: string, message: string): Promise<BossHelperAgentResponse> {
    return createBossHelperAgentResponse(true, code, message, await getStatsData())
  }

  async function fail(code: string, message: string): Promise<BossHelperAgentResponse> {
    return createBossHelperAgentResponse(false, code, message, await getStatsData())
  }

  async function configOk(
    code: string,
    message: string,
    config: BossHelperAgentConfigSnapshot['config'],
  ): Promise<BossHelperAgentResponse<BossHelperAgentConfigUpdateData>> {
    return createBossHelperAgentResponse(true, code, message, { config })
  }

  async function configFail(
    code: string,
    message: string,
    errors?: BossHelperAgentValidationError[],
  ): Promise<BossHelperAgentResponse<BossHelperAgentConfigUpdateData>> {
    await ensureStoresLoaded()
    return createBossHelperAgentResponse(false, code, message, {
      config: conf.getRuntimeConfigSnapshot(),
      errors,
    })
  }

  function ensureSupportedPage() {
    return isBossHelperSupportedJobUrl(location.href)
  }

  async function runBatch(mode: 'start' | 'resume', options?: BossHelperAgentStartPayload) {
    common.deliverLock = true
    common.deliverStop = false
    stopRequestedByCommand = false
    setDeliverState(
      'running',
      mode === 'resume'
        ? '投递已恢复'
        : activeTargetJobIds.length > 0
          ? `定向投递进行中，目标 ${activeTargetJobIds.length} 个岗位`
          : '投递进行中',
    )
    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type: mode === 'resume' ? 'batch-resumed' : 'batch-started',
        state: 'running',
        message:
          mode === 'resume'
            ? '投递已恢复'
            : activeTargetJobIds.length > 0
              ? `定向投递任务已启动，目标 ${activeTargetJobIds.length} 个岗位`
              : '投递任务已启动',
        progress: currentProgressSnapshot(),
        detail: {
          mode,
        },
      }),
    )

    let stepMsg = mode === 'resume' ? '投递已恢复' : '投递结束'
    let failed = false
    let resetSelectionStatuses = Boolean(options?.resetFiltered)

    try {
      logger.debug(`${mode} batch`, page)
      let oldLen = 0
      let oldFirstJobId = ''

      while (!common.deliverStop) {
        if (remainingTargetJobIds.length === 0 && activeTargetJobIds.length > 0) {
          stepMsg = `定向投递完成，共处理 ${activeTargetJobIds.length} 个目标岗位`
          break
        }

        await delay(conf.formData.delay.deliveryStarts)
        if (jobList._list.value.length === 0) {
          stepMsg = '投递结束, job列表为空'
          break
        }

        const currentFirstJobId = jobList._list.value[0]?.encryptJobId ?? ''
        if (
          (location.href.includes('/web/geek/job-recommend') ||
            location.href.includes('/web/geek/jobs')) &&
          oldLen === jobList._list.value.length &&
          oldFirstJobId === currentFirstJobId
        ) {
          stepMsg = '投递结束, 未能获取更多岗位(job列表无变化)'
          break
        }

        oldLen = jobList._list.value.length
        oldFirstJobId = currentFirstJobId
        const result = await deliver.jobListHandle({
          selectedJobIds: remainingTargetJobIds.length > 0 ? remainingTargetJobIds : undefined,
          resetSelectionStatuses,
        })
        resetSelectionStatuses = false

        if (remainingTargetJobIds.length > 0 && result.seenJobIds.length > 0) {
          const seenJobIdSet = new Set(result.seenJobIds)
          remainingTargetJobIds = remainingTargetJobIds.filter((jobId) => !seenJobIdSet.has(jobId))
          if (remainingTargetJobIds.length === 0) {
            stepMsg = `定向投递完成，共处理 ${activeTargetJobIds.length} 个目标岗位`
            break
          }
        }

        if (common.deliverStop) {
          stepMsg = '投递已暂停'
          break
        }

        await delay(conf.formData.delay.deliveryPageNext)
        if (!next()) {
          stepMsg =
            remainingTargetJobIds.length > 0
              ? `定向投递结束，仍有 ${remainingTargetJobIds.length} 个目标岗位未命中`
              : '投递结束, 无法继续下一页'
          break
        }
      }
    } catch (error) {
      failed = true
      logger.error('获取失败', error)
      stepMsg = `获取失败! - ${error instanceof Error ? error.message : String(error)}`
    } finally {
      logger.debug('日志信息', log.data)
      conf.formData.notification.value && (await notification(stepMsg))
      ElMessage.info(stepMsg)
      common.deliverLock = false

      if (failed) {
        stopRequestedByCommand = false
        setDeliverState('error', stepMsg)
        emitBossHelperAgentEvent(
          createBossHelperAgentEvent({
            type: 'batch-error',
            state: 'error',
            message: stepMsg,
            progress: currentProgressSnapshot(),
          }),
        )
        clearTargetJobState()
      } else if (common.deliverStop) {
        if (stopRequestedByCommand) {
          stopRequestedByCommand = false
          common.deliverStop = false
          clearTargetJobState()
          setDeliverState('idle', '投递任务已停止')
          emitBossHelperAgentEvent(
            createBossHelperAgentEvent({
              type: 'batch-stopped',
              state: 'idle',
              message: '投递任务已停止',
              progress: currentProgressSnapshot(),
              detail: {
                source: 'stop-command',
              },
            }),
          )
        } else {
          setDeliverState('paused', stepMsg)
          emitBossHelperAgentEvent(
            createBossHelperAgentEvent({
              type: 'batch-paused',
              state: 'paused',
              message: stepMsg,
              progress: currentProgressSnapshot(),
            }),
          )
        }
      } else {
        stopRequestedByCommand = false
        setDeliverState('completed', stepMsg)
        emitBossHelperAgentEvent(
          createBossHelperAgentEvent({
            type: 'batch-completed',
            state: 'completed',
            message: stepMsg,
            progress: currentProgressSnapshot(),
          }),
        )
        clearTargetJobState()
      }
    }
  }

  function resetFilter() {
    jobList._list.value.forEach((v) => {
      switch (v.status.status) {
        case 'success':
          break
        case 'pending':
        case 'wait':
        case 'running':
        case 'error':
        case 'warn':
        default:
          v.status.setStatus('wait', '等待中')
      }
    })
  }

  async function startBatch(payload?: BossHelperAgentStartPayload) {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }
    if (common.deliverLock || batchPromise) {
      return fail('already-running', '当前已有进行中的投递任务')
    }
    if (common.deliverState === 'paused') {
      return fail('paused', '当前任务已暂停，请调用 resume 继续执行')
    }

    await applyStartPayload(payload)

    batchPromise = runBatch('start', payload).finally(() => {
      batchPromise = null
    })
    return ok(
      'started',
      activeTargetJobIds.length > 0
        ? `定向投递任务已启动，目标 ${activeTargetJobIds.length} 个岗位`
        : '投递任务已启动',
    )
  }

  async function pauseBatch() {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }
    if (common.deliverState === 'paused') {
      return ok('already-paused', '当前任务已经暂停')
    }
    if (!common.deliverLock) {
      return fail('not-running', '当前没有进行中的投递任务')
    }

    common.deliverStop = true
    setDeliverState('pausing', '正在暂停，等待当前岗位处理完成')
    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type: 'batch-pausing',
        state: 'pausing',
        message: '正在暂停，等待当前岗位处理完成',
        progress: currentProgressSnapshot(),
      }),
    )
    return ok('pause-requested', '已发出暂停指令')
  }

  async function resumeBatch() {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }
    if (common.deliverLock || batchPromise) {
      return fail('already-running', '当前已有进行中的投递任务')
    }
    if (common.deliverState !== 'paused') {
      return fail('not-paused', '当前任务不处于暂停状态')
    }

    batchPromise = runBatch('resume').finally(() => {
      batchPromise = null
    })
    return ok('resumed', '投递任务已恢复')
  }

  async function stopBatch() {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }

    if (common.deliverState === 'idle' && !common.deliverLock && !batchPromise) {
      clearTargetJobState()
      common.deliverStop = false
      stopRequestedByCommand = false
      return ok('already-stopped', '当前没有进行中的投递任务')
    }

    if (common.deliverState === 'paused' && !common.deliverLock && !batchPromise) {
      clearTargetJobState()
      common.deliverStop = false
      stopRequestedByCommand = false
      setDeliverState('idle', '投递任务已停止')
      emitBossHelperAgentEvent(
        createBossHelperAgentEvent({
          type: 'batch-stopped',
          state: 'idle',
          message: '投递任务已停止',
          progress: currentProgressSnapshot(),
          detail: {
            source: 'stop-command',
          },
        }),
      )
      return ok('stopped', '投递任务已停止')
    }

    stopRequestedByCommand = true
    common.deliverStop = true
    abortAllPendingAIFilterReviews('任务已停止')
    setDeliverState('pausing', '正在停止，等待当前岗位处理完成')
    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        type: 'batch-pausing',
        state: 'pausing',
        message: '正在停止，等待当前岗位处理完成',
        progress: currentProgressSnapshot(),
        detail: {
          source: 'stop-command',
        },
      }),
    )

    if (batchPromise) {
      await batchPromise
    }

    return ok('stopped', '投递任务已停止')
  }

  async function stats() {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }

    return ok('stats', '已返回当前状态')
  }

  async function resumeGet() {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentResumeData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }

    try {
      const user = useUser()
      const resumeData = await user.getUserResumeData()
      const resumeText = await user.getUserResumeString({})
      return createBossHelperAgentResponse(true, 'resume', '已返回当前简历', {
        userId: user.getUserId(),
        resumeData: jsonClone(resumeData),
        resumeText,
      })
    } catch (error) {
      return createBossHelperAgentResponse<BossHelperAgentResumeData>(
        false,
        'resume-load-failed',
        error instanceof Error ? error.message : '简历读取失败',
      )
    }
  }

  async function navigate(payload?: BossHelperAgentNavigatePayload) {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentNavigateData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }

    try {
      const targetUrl = buildNavigateUrl(payload)
      window.setTimeout(() => {
        window.location.href = targetUrl
      }, 50)

      return createBossHelperAgentResponse(true, 'navigate-accepted', '已接受导航请求', {
        targetUrl,
      })
    } catch (error) {
      return createBossHelperAgentResponse<BossHelperAgentNavigateData>(
        false,
        'navigate-invalid',
        error instanceof Error ? error.message : '导航参数不合法',
      )
    }
  }

  async function chatList(payload?: BossHelperAgentChatListPayload) {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentChatListData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }

    const result = chat.listChatConversations(payload?.limit ?? 20)
    return createBossHelperAgentResponse(true, 'chat-list', '已返回当前页面聊天会话', {
      conversations: result.items,
      total: result.total,
    })
  }

  async function chatHistory(payload?: BossHelperAgentChatHistoryPayload) {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentChatHistoryData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }
    if (!payload?.conversationId?.trim()) {
      return createBossHelperAgentResponse<BossHelperAgentChatHistoryData>(
        false,
        'missing-conversation-id',
        '缺少 conversationId',
      )
    }

    const result = chat.getChatHistory(
      payload.conversationId.trim(),
      payload.offset ?? 0,
      payload.limit ?? 50,
    )

    return createBossHelperAgentResponse(true, 'chat-history', '已返回当前页面聊天记录', {
      conversationId: payload.conversationId.trim(),
      items: result.items.map((item) => toAgentChatMessage(payload.conversationId.trim(), item)),
      limit: result.limit,
      offset: result.offset,
      total: result.total,
    })
  }

  async function chatSend(payload?: BossHelperAgentChatSendPayload) {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }
    if (!payload?.content?.trim()) {
      return fail('missing-content', '缺少聊天内容')
    }
    if (!payload.to_uid || !payload.to_name?.trim()) {
      return fail('missing-chat-target', '缺少 to_uid 或 to_name')
    }

    const userId = payload.form_uid ?? useUser().getUserId()
    if (userId == null || userId === '') {
      return fail('missing-form-uid', '缺少 form_uid，且当前页面未获取到用户 ID')
    }

    try {
      const message = new Message({
        form_uid: String(userId),
        to_uid: String(payload.to_uid),
        to_name: payload.to_name.trim(),
        content: payload.content.trim(),
      })
      message.send()

      emitBossHelperAgentEvent(
        createBossHelperAgentEvent({
          type: 'chat-sent',
          state: common.deliverState,
          message: `消息已发送给 ${payload.to_name.trim()}`,
          progress: currentProgressSnapshot(),
          detail: {
            to_uid: String(payload.to_uid),
            to_name: payload.to_name.trim(),
            content: payload.content.trim(),
          },
        }),
      )

      return ok('chat-sent', '消息已发送')
    } catch (error) {
      return fail(
        'chat-send-failed',
        error instanceof Error ? error.message : '消息发送失败',
      )
    }
  }

  async function jobsList(payload?: BossHelperAgentJobsListPayload) {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
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

    const data: BossHelperAgentJobsListData = {
      jobs: jobs.map(toAgentJobSummary),
      total: jobs.length,
      totalOnPage: allJobs.length,
    }

    return createBossHelperAgentResponse(true, 'jobs-list', '已返回当前职位列表', data)
  }

  async function logsQuery(payload?: BossHelperAgentLogsQueryPayload) {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
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
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
      return fail('unsupported-page', '当前页面不支持自动投递')
    }
    if (!payload?.encryptJobId) {
      return fail('missing-job-id', '缺少 encryptJobId')
    }

    const accepted = submitExternalAIFilterReview(payload)
    if (!accepted) {
      return fail('review-not-found', '当前没有匹配的待审核岗位')
    }

    return ok('review-submitted', '已接收外部审核结果')
  }

  async function jobsDetail(payload?: BossHelperAgentJobDetailPayload) {
    await ensureStoresLoaded()
    if (!ensureSupportedPage()) {
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

      const data: BossHelperAgentJobDetailData = {
        job: toAgentJobDetail(item, item.card),
      }

      return createBossHelperAgentResponse(true, 'job-detail', '已返回岗位详情', data)
    } catch (error) {
      return createBossHelperAgentResponse<BossHelperAgentJobDetailData>(
        false,
        'job-detail-load-failed',
        error instanceof Error ? error.message : '岗位详情加载失败',
      )
    }
  }

  async function getConfig() {
    await ensureStoresLoaded()
    return configOk('config', '已返回当前配置', conf.getRuntimeConfigSnapshot())
  }

  async function updateConfig(payload?: BossHelperAgentConfigUpdatePayload) {
    await ensureStoresLoaded()
    if (!payload?.configPatch || Object.keys(payload.configPatch).length === 0) {
      return configFail('empty-config-patch', '缺少 configPatch 或 patch 为空')
    }

    const validationErrors = validateConfigPatch(payload.configPatch)
    if (validationErrors.length > 0) {
      return configFail('validation-failed', '配置校验失败', validationErrors)
    }

    const config = await conf.applyRuntimeConfigPatch(payload.configPatch, {
      persist: payload.persist,
    })

    return configOk(
      'config-updated',
      payload.persist ? '配置已更新并持久化' : '配置已更新',
      config,
    )
  }

  const controller: BossHelperAgentController = {
    start: startBatch,
    pause: pauseBatch,
    resume: resumeBatch,
    resumeGet,
    stop: stopBatch,
    stats,
    navigate,
    chatList,
    chatHistory,
    chatSend,
    jobsReview,
    logsQuery,
    jobsList,
    jobsDetail: (payload) => jobsDetail(payload),
    configGet: getConfig,
    configUpdate: (payload) => updateConfig(payload),
    async handle(request: BossHelperAgentRequest) {
      switch (request.command) {
        case 'start':
          return startBatch(request.payload as BossHelperAgentStartPayload | undefined)
        case 'pause':
          return pauseBatch()
        case 'resume':
          return resumeBatch()
        case 'resume.get':
          return resumeGet()
        case 'stop':
          return stopBatch()
        case 'stats':
          return stats()
        case 'navigate':
          return navigate(request.payload as BossHelperAgentNavigatePayload | undefined)
        case 'chat.list':
          return chatList(request.payload as BossHelperAgentChatListPayload | undefined)
        case 'chat.history':
          return chatHistory(request.payload as BossHelperAgentChatHistoryPayload | undefined)
        case 'chat.send':
          return chatSend(request.payload as BossHelperAgentChatSendPayload | undefined)
        case 'logs.query':
          return logsQuery(request.payload as BossHelperAgentLogsQueryPayload | undefined)
        case 'jobs.list':
          return jobsList(request.payload as BossHelperAgentJobsListPayload | undefined)
        case 'jobs.detail':
          return jobsDetail(request.payload as BossHelperAgentJobDetailPayload | undefined)
        case 'jobs.review':
          return jobsReview(request.payload as BossHelperAgentJobReviewPayload | undefined)
        case 'config.get':
          return getConfig()
        case 'config.update':
          return updateConfig(request.payload as BossHelperAgentConfigUpdatePayload | undefined)
      }
    },
  }

  return {
    controller,
    pauseBatch,
    registerWindowAgentBridge() {
      window.__bossHelperAgent = controller
      const stopAgentEventBridge = onBossHelperAgentEvent((payload) => {
        window.postMessage(
          {
            type: BOSS_HELPER_AGENT_EVENT_BRIDGE,
            payload,
          },
          '*',
        )
      })

      const onMessage = (event: MessageEvent) => {
        if (event.source !== window || !isBossHelperAgentBridgeRequest(event.data)) {
          return
        }

        void controller
          .handle(event.data.payload)
          .catch((error) => {
            return createBossHelperAgentResponse(
              false,
              'controller-error',
              error instanceof Error ? error.message : '未知错误',
            )
          })
          .then((payload) => {
            window.postMessage(
              {
                type: BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
                requestId: event.data.requestId,
                payload,
              },
              '*',
            )
          })
      }

      window.addEventListener('message', onMessage)

      return () => {
        stopAgentEventBridge()
        if (window.__bossHelperAgent === controller) {
          delete window.__bossHelperAgent
        }
        window.removeEventListener('message', onMessage)
      }
    },
    resetFilter,
    resumeBatch,
    startBatch,
    stopBatch,
    stats,
  }
}