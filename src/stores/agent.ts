import { defineStore } from 'pinia'
import { computed, shallowRef, ref, toRaw } from 'vue'

import type {
  BossHelperAgentCurrentJob,
  BossHelperAgentEvent,
  BossHelperAgentProgress,
  BossHelperAgentRunError,
  BossHelperAgentRunRecovery,
  BossHelperAgentRunSnapshot,
  BossHelperAgentRunState,
  BossHelperAgentRunSummaryData,
} from '@/message/agent'
import { counter } from '@/message'
import { logger } from '@/utils/logger'

const agentRunSummaryStorageKey = 'session:zhipin-agent-run-summary-v1'

function cloneData<T>(value: T): T {
  return value == null ? value : structuredClone(toRaw(value))
}

function dedupeJobIds(jobIds: string[] | undefined) {
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return []
  }

  return [...new Set(jobIds.map((jobId) => String(jobId).trim()).filter(Boolean))]
}

function cloneCurrentJob(job: BossHelperAgentCurrentJob | null | undefined) {
  return job ? { ...job } : null
}

function getCurrentPageSnapshot() {
  const href = typeof location === 'undefined' ? '' : location.href
  const pathname = typeof location === 'undefined' ? '' : location.pathname
  let routeKind = 'unknown'

  if (pathname.startsWith('/web/geek/jobs')) {
    routeKind = 'jobs'
  } else if (pathname.startsWith('/web/geek/job-recommend')) {
    routeKind = 'job-recommend'
  } else if (pathname.startsWith('/web/geek/job')) {
    routeKind = 'job'
  }

  return {
    routeKind,
    url: href,
  }
}

function createRunRecovery(state: BossHelperAgentRunState): BossHelperAgentRunRecovery {
  switch (state) {
    case 'paused':
      return {
        resumable: true,
        requiresPageReload: false,
        suggestedAction: 'resume',
        reason: '运行已暂停，可继续调用 resume。',
      }
    case 'pausing':
      return {
        resumable: true,
        requiresPageReload: false,
        suggestedAction: 'continue',
        reason: '运行正在暂停，等待当前岗位处理完成。',
      }
    case 'completed':
      return {
        resumable: false,
        requiresPageReload: false,
        suggestedAction: 'continue',
        reason: '运行已完成，如需继续请重新读取页面后决定下一步。',
      }
    case 'stopped':
      return {
        resumable: false,
        requiresPageReload: false,
        suggestedAction: 'continue',
        reason: '运行已停止，如需继续请重新发起新的 start。',
      }
    case 'error':
      return {
        resumable: false,
        requiresPageReload: true,
        suggestedAction: 'refresh-page',
        reason: '运行以错误结束，建议先刷新页面并重新观察 readiness。',
      }
    default:
      return {
        resumable: true,
        requiresPageReload: false,
        suggestedAction: 'continue',
        reason: '运行仍在当前页面上下文中。',
      }
  }
}

function normalizeRunError(value: unknown): BossHelperAgentRunError | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const error = value as Partial<BossHelperAgentRunError>
  return {
    at: typeof error.at === 'string' ? error.at : '',
    code: typeof error.code === 'string' ? error.code : 'unknown-error',
    job: cloneCurrentJob(error.job),
    message: typeof error.message === 'string' ? error.message : '',
  }
}

function normalizeRunSnapshot(value: unknown): BossHelperAgentRunSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const snapshot = value as Partial<BossHelperAgentRunSnapshot>
  const page = (snapshot.page && typeof snapshot.page === 'object' ? snapshot.page : {}) as Partial<
    BossHelperAgentRunSnapshot['page']
  >
  const state =
    snapshot.state === 'running'
    || snapshot.state === 'pausing'
    || snapshot.state === 'paused'
    || snapshot.state === 'completed'
    || snapshot.state === 'stopped'
    || snapshot.state === 'error'
      ? snapshot.state
      : 'stopped'

  return {
    activeTargetJobIds: dedupeJobIds(snapshot.activeTargetJobIds),
    analyzedJobIds: dedupeJobIds(snapshot.analyzedJobIds),
    currentJob: cloneCurrentJob(snapshot.currentJob),
    finishedAt: typeof snapshot.finishedAt === 'string' ? snapshot.finishedAt : null,
    lastDecision:
      snapshot.lastDecision && typeof snapshot.lastDecision === 'object'
        ? {
            at: typeof snapshot.lastDecision.at === 'string' ? snapshot.lastDecision.at : '',
            job: cloneCurrentJob(snapshot.lastDecision.job),
            message:
              typeof snapshot.lastDecision.message === 'string'
                ? snapshot.lastDecision.message
                : '',
            type:
              typeof snapshot.lastDecision.type === 'string' ? snapshot.lastDecision.type : 'unknown',
          }
        : null,
    lastError: normalizeRunError(snapshot.lastError),
    page: {
      page: Number.isFinite(page.page) ? Number(page.page) : null,
      pageSize: Number.isFinite(page.pageSize) ? Number(page.pageSize) : null,
      routeKind: typeof page.routeKind === 'string' ? page.routeKind : 'unknown',
      url: typeof page.url === 'string' ? page.url : '',
    },
    processedJobIds: dedupeJobIds(snapshot.processedJobIds),
    recovery:
      snapshot.recovery && typeof snapshot.recovery === 'object'
        ? {
            resumable: snapshot.recovery.resumable === true,
            requiresPageReload: snapshot.recovery.requiresPageReload === true,
            suggestedAction:
              typeof snapshot.recovery.suggestedAction === 'string'
                ? snapshot.recovery.suggestedAction
                : createRunRecovery(state).suggestedAction,
            reason:
              typeof snapshot.recovery.reason === 'string'
                ? snapshot.recovery.reason
                : createRunRecovery(state).reason,
          }
        : createRunRecovery(state),
    remainingTargetJobIds: dedupeJobIds(snapshot.remainingTargetJobIds),
    runId: typeof snapshot.runId === 'string' && snapshot.runId ? snapshot.runId : crypto.randomUUID(),
    startedAt: typeof snapshot.startedAt === 'string' ? snapshot.startedAt : new Date().toISOString(),
    state,
    updatedAt: typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : new Date().toISOString(),
  }
}

function normalizeProgressState(state: BossHelperAgentProgress['state'] | undefined): BossHelperAgentRunState | null {
  if (state === 'running' || state === 'pausing' || state === 'paused' || state === 'completed' || state === 'error') {
    return state
  }

  return null
}

function addJobId(list: string[], jobId: string | undefined) {
  if (!jobId) {
    return list
  }

  return list.includes(jobId) ? list : [...list, jobId]
}

const consecutiveFailureGuardrailLimit = 3

interface AgentFailureGuardrailTrigger {
  at: string
  code: 'consecutive-failure-auto-stop'
  consecutiveFailures: number
  limit: number
  message: string
}

interface AgentFailureGuardrailSnapshot {
  consecutiveFailures: number
  limit: number
  triggered: AgentFailureGuardrailTrigger | null
}

export const useAgentRuntime = defineStore('zhipin/agent-runtime', () => {
  const batchPromise = shallowRef<Promise<void> | null>(null)
  const activeTargetJobIds = ref<string[]>([])
  const remainingTargetJobIds = ref<string[]>([])
  const stopRequestedByCommand = ref(false)
  const currentRun = ref<BossHelperAgentRunSnapshot | null>(null)
  const recentRun = ref<BossHelperAgentRunSnapshot | null>(null)
  const runSummaryLoaded = ref(false)
  const consecutiveFailures = ref(0)
  const lastFailureGuardrailTrigger = ref<AgentFailureGuardrailTrigger | null>(null)

  const hasPendingBatch = computed(() => batchPromise.value != null)
  let loadRunSummaryPromise: Promise<void> | null = null

  function getRunSummarySnapshot(): BossHelperAgentRunSummaryData {
    return {
      current: cloneData(currentRun.value),
      recent: cloneData(recentRun.value),
    }
  }

  function persistRunSummary() {
    const snapshot = getRunSummarySnapshot()
    return counter.storageSet(agentRunSummaryStorageKey, snapshot).catch((error) => {
      logger.warn('持久化 agent run summary 失败', error)
    })
  }

  function queuePersistRunSummary() {
    if (!runSummaryLoaded.value) {
      return
    }

    void persistRunSummary()
  }

  async function ensureRunSummaryLoaded() {
    if (runSummaryLoaded.value) {
      return
    }

    if (!loadRunSummaryPromise) {
      loadRunSummaryPromise = counter
        .storageGet<BossHelperAgentRunSummaryData>(agentRunSummaryStorageKey, {
          current: null,
          recent: null,
        })
        .then((stored) => {
          currentRun.value = normalizeRunSnapshot(stored?.current)
          recentRun.value = normalizeRunSnapshot(stored?.recent)
          runSummaryLoaded.value = true
        })
        .catch((error) => {
          currentRun.value = null
          recentRun.value = null
          runSummaryLoaded.value = true
          logger.warn('读取 agent run summary 失败', error)
        })
    }

    await loadRunSummaryPromise
  }

  function createRunSnapshot(
    state: BossHelperAgentRunState,
    progress?: Partial<BossHelperAgentProgress>,
    now = new Date().toISOString(),
  ): BossHelperAgentRunSnapshot {
    const pageSnapshot = getCurrentPageSnapshot()
    const initialTargetJobIds = dedupeJobIds(progress?.activeTargetJobIds)

    return {
      activeTargetJobIds: initialTargetJobIds,
      analyzedJobIds: [],
      currentJob: cloneCurrentJob(progress?.currentJob),
      finishedAt: null,
      lastDecision: null,
      lastError: null,
      page: {
        page: Number.isFinite(progress?.page) ? Number(progress?.page) : null,
        pageSize: Number.isFinite(progress?.pageSize) ? Number(progress?.pageSize) : null,
        routeKind: pageSnapshot.routeKind,
        url: pageSnapshot.url,
      },
      processedJobIds: [],
      recovery: createRunRecovery(state),
      remainingTargetJobIds: dedupeJobIds(progress?.remainingTargetJobIds ?? initialTargetJobIds),
      runId: crypto.randomUUID(),
      startedAt: now,
      state,
      updatedAt: now,
    }
  }

  function mergeProgress(run: BossHelperAgentRunSnapshot, progress?: Partial<BossHelperAgentProgress>) {
    if (!progress) {
      return
    }

    if (Array.isArray(progress.activeTargetJobIds)) {
      run.activeTargetJobIds = dedupeJobIds(progress.activeTargetJobIds)
    }
    if (Array.isArray(progress.remainingTargetJobIds)) {
      run.remainingTargetJobIds = dedupeJobIds(progress.remainingTargetJobIds)
    }
    if (progress.currentJob !== undefined) {
      run.currentJob = cloneCurrentJob(progress.currentJob)
    }
    if (Number.isFinite(progress.page)) {
      run.page.page = Number(progress.page)
    }
    if (Number.isFinite(progress.pageSize)) {
      run.page.pageSize = Number(progress.pageSize)
    }

    const livePage = getCurrentPageSnapshot()
    run.page.routeKind = livePage.routeKind
    run.page.url = livePage.url
  }

  function ensureCurrentRun(
    state: BossHelperAgentRunState,
    progress?: Partial<BossHelperAgentProgress>,
    now = new Date().toISOString(),
  ) {
    if (!currentRun.value) {
      const resumableRecent = recentRun.value?.state === 'paused' ? cloneData(recentRun.value) : null
      currentRun.value = resumableRecent ?? createRunSnapshot(state, progress, now)
      currentRun.value.finishedAt = null
      currentRun.value.state = state
      currentRun.value.recovery = createRunRecovery(state)
    }

    mergeProgress(currentRun.value, progress)
    currentRun.value.updatedAt = now
    return currentRun.value
  }

  function syncRecentRun() {
    recentRun.value = cloneData(currentRun.value)
  }

  function finalizeCurrentRun(state: BossHelperAgentRunState, now: string) {
    if (!currentRun.value) {
      return
    }

    currentRun.value.state = state
    currentRun.value.updatedAt = now
    currentRun.value.finishedAt = now
    currentRun.value.recovery = createRunRecovery(state)
    syncRecentRun()
    currentRun.value = null
  }

  async function recordEvent(event: BossHelperAgentEvent, liveProgress?: Partial<BossHelperAgentProgress>) {
    await ensureRunSummaryLoaded()

    const now = typeof event.createdAt === 'string' && event.createdAt ? event.createdAt : new Date().toISOString()
    const mergedProgress = {
      ...liveProgress,
      ...event.progress,
      currentJob: event.job ?? liveProgress?.currentJob ?? null,
    }
    const eventState = event.type === 'batch-error'
      ? 'error'
      : event.type === 'batch-stopped'
        ? 'stopped'
        : event.type === 'batch-completed'
          ? 'completed'
          : event.type === 'batch-paused'
            ? 'paused'
            : event.type === 'batch-pausing' || event.type === 'limit-reached'
              ? 'pausing'
              : normalizeProgressState(event.state) ?? 'running'

    if (event.type === 'batch-started') {
      currentRun.value = createRunSnapshot('running', mergedProgress, now)
    }

    const run = ensureCurrentRun(eventState, mergedProgress, now)
    run.lastDecision = {
      at: now,
      job: cloneCurrentJob(event.job ?? run.currentJob),
      message: event.message,
      type: event.type,
    }
    run.recovery = createRunRecovery(run.state)

    const jobId = event.job?.encryptJobId
    if (event.type === 'job-started' || event.type === 'job-pending-review') {
      run.analyzedJobIds = addJobId(run.analyzedJobIds, jobId)
    }

    if (
      event.type === 'job-succeeded'
      || event.type === 'job-filtered'
      || event.type === 'job-failed'
    ) {
      run.analyzedJobIds = addJobId(run.analyzedJobIds, jobId)
      run.processedJobIds = addJobId(run.processedJobIds, jobId)
    }

    if (
      event.type === 'job-failed'
      || event.type === 'batch-error'
      || (event.type === 'limit-reached' && typeof event.detail?.guardrailCode === 'string')
    ) {
      run.lastError = {
        at: now,
        code: (() => {
          if (typeof event.detail?.guardrailCode === 'string') {
            return event.detail.guardrailCode
          }
          if (typeof event.detail?.errorName === 'string') {
            return event.detail.errorName
          }
          return event.type === 'batch-error' ? 'batch-error' : 'job-failed'
        })(),
        job: cloneCurrentJob(event.job ?? run.currentJob),
        message: event.message,
      }
    }

    switch (event.type) {
      case 'batch-completed':
        finalizeCurrentRun('completed', now)
        queuePersistRunSummary()
        return
      case 'batch-stopped':
        finalizeCurrentRun('stopped', now)
        queuePersistRunSummary()
        return
      case 'batch-error':
        finalizeCurrentRun('error', now)
        queuePersistRunSummary()
        return
      case 'batch-paused':
        run.state = 'paused'
        run.recovery = createRunRecovery('paused')
        break
      case 'batch-pausing':
      case 'limit-reached':
        run.state = 'pausing'
        run.recovery = createRunRecovery('pausing')
        break
      case 'batch-resumed':
        run.state = 'running'
        run.finishedAt = null
        run.recovery = createRunRecovery('running')
        break
      case 'state-changed': {
        const nextState = normalizeProgressState(event.state)
        if (nextState) {
          run.state = nextState
          run.recovery = createRunRecovery(nextState)
        }
        break
      }
      default:
        run.state = eventState
        run.recovery = createRunRecovery(eventState)
        break
    }

    syncRecentRun()
    queuePersistRunSummary()
  }

  async function updateRunProgress(progress: BossHelperAgentProgress) {
    await ensureRunSummaryLoaded()

    if (!currentRun.value) {
      return
    }

    mergeProgress(currentRun.value, progress)
    currentRun.value.updatedAt = new Date().toISOString()

    const liveState = normalizeProgressState(progress.state)
    if (liveState === 'running' || liveState === 'pausing' || liveState === 'paused') {
      currentRun.value.state = liveState
      currentRun.value.recovery = createRunRecovery(liveState)
    }

    syncRecentRun()
    queuePersistRunSummary()
  }

  function getFailureGuardrailSnapshot(): AgentFailureGuardrailSnapshot {
    return {
      consecutiveFailures: consecutiveFailures.value,
      limit: consecutiveFailureGuardrailLimit,
      triggered: cloneData(lastFailureGuardrailTrigger.value),
    }
  }

  function clearFailureGuardrailState(options: { clearTrigger?: boolean } = {}) {
    consecutiveFailures.value = 0
    if (options.clearTrigger) {
      lastFailureGuardrailTrigger.value = null
    }
  }

  function registerFailureGuardrail(): AgentFailureGuardrailTrigger | null {
    const nextCount = consecutiveFailures.value + 1
    consecutiveFailures.value = nextCount
    if (nextCount < consecutiveFailureGuardrailLimit) {
      return null
    }

    const trigger: AgentFailureGuardrailTrigger = {
      at: new Date().toISOString(),
      code: 'consecutive-failure-auto-stop',
      consecutiveFailures: nextCount,
      limit: consecutiveFailureGuardrailLimit,
      message: `连续失败达到 ${consecutiveFailureGuardrailLimit} 次，已自动暂停投递，请先检查最近错误后再决定是否 resume。`,
    }
    lastFailureGuardrailTrigger.value = trigger
    return cloneData(trigger)
  }

  function setBatchPromise(promise: Promise<void> | null) {
    batchPromise.value = promise
  }

  function setTargetJobIds(jobIds: string[]) {
    activeTargetJobIds.value = [...jobIds]
    remainingTargetJobIds.value = [...jobIds]
  }

  function clearTargetJobState() {
    activeTargetJobIds.value = []
    remainingTargetJobIds.value = []
  }

  function consumeSeenJobIds(seenJobIds: string[]) {
    if (seenJobIds.length === 0 || remainingTargetJobIds.value.length === 0) {
      return remainingTargetJobIds.value.length
    }

    const seenJobIdSet = new Set(seenJobIds)
    remainingTargetJobIds.value = remainingTargetJobIds.value.filter(
      (jobId) => !seenJobIdSet.has(jobId),
    )
    return remainingTargetJobIds.value.length
  }

  function setStopRequestedByCommand(value: boolean) {
    stopRequestedByCommand.value = value
  }

  return {
    batchPromise,
    clearFailureGuardrailState,
    currentRun,
    hasPendingBatch,
    ensureRunSummaryLoaded,
    getFailureGuardrailSnapshot,
    getRunSummarySnapshot,
    activeTargetJobIds,
    recentRun,
    recordEvent,
    registerFailureGuardrail,
    remainingTargetJobIds,
    stopRequestedByCommand,
    setBatchPromise,
    setTargetJobIds,
    clearTargetJobState,
    consumeSeenJobIds,
    setStopRequestedByCommand,
    updateRunProgress,
  }
})
