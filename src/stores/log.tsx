import { computed, ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'

import type {
  AIFilteringScoreDetail,
  BossHelperError,
} from '@/types/deliverError'
import type { amapDistance, amapGeocode } from '@/utils/amap'

import type { MyJobListData } from './jobs'
import { createLogColumns } from './logColumns'

export type logErr = BossHelperError | null | undefined

export interface PipelineErrorContext {
  errorMessage: string
  errorName: string
  errorStack?: string
  jobId: string
  rawErrorMessage?: string
  rawErrorName?: string
  rawErrorStack?: string
  stage: 'before' | 'after'
  step: string
}

export interface logData {
  listData: MyJobListData
  el?: Element
  amap?: {
    geocode?: Awaited<ReturnType<typeof amapGeocode>>
    distance?: Awaited<ReturnType<typeof amapDistance>>
  }
  bossData?: bossZpBossData
  message?: string
  state?: string
  err?: string
  aiFilteringQ?: string
  aiFilteringR?: string | null
  aiFilteringAjson?: Record<string, unknown>
  aiFilteringAtext?: string
  aiFilteringScore?: AIFilteringScoreDetail
  aiGreetingQ?: string
  aiGreetingR?: string | null
  aiGreetingA?: string
  externalGreeting?: string
  pipelineError?: PipelineErrorContext
}

export type LogState = 'info' | 'success' | 'warning' | 'danger'
export type LogStateName = readonly [LogState, string]

export interface LogEntry {
  createdAt: string
  job?: MyJobListData
  title: string
  state: LogState
  state_name: string
  message?: string
  data?: logData
}

export interface LogQueryOptions {
  from?: string
  limit?: number
  offset?: number
  status?: string[]
  to?: string
}

export const stateNames = [
  ['info', '消息'],
  ['success', '投递成功'],
  ['warning', '重复沟通'],
  ['warning', '岗位名筛选'],
  ['warning', '公司名筛选'],
  ['warning', '薪资筛选'],
  ['warning', '公司规模筛选'],
  ['warning', '工作内容筛选'],
  ['warning', 'Hr职位筛选'],
  ['warning', 'AI筛选'],
  ['warning', '好友状态'],
  ['warning', '活跃度过滤'],
  ['warning', '猎头过滤'],
  ['danger', '未知错误'],
  ['danger', '投递出错'],
  ['danger', '打招呼出错'],
] as const satisfies readonly LogStateName[]

const useLogStore = defineStore('log', () => {
  const dialogData = ref<{ show: boolean; data?: LogEntry }>({ show: false })
  const data = ref<LogEntry[]>([])
  const filterStatus = ref<string[]>(stateNames.map((item) => item[1]))
  const filterData = computed(() => {
    if (filterStatus.value.length !== stateNames.length) {
      return data.value.filter((item) => filterStatus.value.includes(item.state_name))
    }
    return data.value
  })

  function query(options: LogQueryOptions = {}) {
    const limit = Number.isInteger(options.limit) && (options.limit ?? 0) > 0 ? options.limit! : 50
    const offset = Number.isInteger(options.offset) && (options.offset ?? 0) >= 0 ? options.offset! : 0
    const statusFilter = options.status?.length ? new Set(options.status) : null
    const fromTs = options.from ? Date.parse(options.from) : null
    const toTs = options.to ? Date.parse(options.to) : null
    const items: LogEntry[] = []
    let total = 0

    for (let index = data.value.length - 1; index >= 0; index -= 1) {
      const item = data.value[index]
      if (statusFilter && !statusFilter.has(item.state_name) && !statusFilter.has(item.state)) {
        continue
      }

      const createdAt = Date.parse(item.createdAt)
      if (fromTs != null && !Number.isNaN(fromTs) && createdAt < fromTs) {
        continue
      }
      if (toTs != null && !Number.isNaN(toTs) && createdAt > toTs) {
        continue
      }

      total += 1
      if (total <= offset || items.length >= limit) {
        continue
      }

      items.push(item)
    }

    return {
      items,
      limit,
      offset,
      total,
    }
  }

  function add(job: MyJobListData, err: logErr, logdata?: logData, msg?: string) {
    const state = !err ? 'success' : err.state
    const message = msg ?? (err ? err.message : undefined)

    data.value.push({
      createdAt: new Date().toISOString(),
      job,
      title: job.jobName,
      state,
      state_name: err?.name ?? '投递成功',
      message,
      data: logdata,
    })
  }

  function info(title: string, message: string) {
    data.value.push({
      createdAt: new Date().toISOString(),
      title,
      state: 'info',
      state_name: '消息',
      message,
      data: undefined,
    })
  }

  function clear() {
    data.value = []
  }

  return {
    data,
    dialogData,
    filterData,
    filterStatus,
    clear,
    add,
    info,
    query,
  }
})

export function useLog() {
  const store = useLogStore()
  const refs = storeToRefs(store)

  return {
    ...refs,
    columns: createLogColumns({
      dialogData: refs.dialogData,
      filterStatus: refs.filterStatus,
      stateNames,
    }),
    clear: store.clear,
    add: store.add,
    info: store.info,
    query: store.query,
  }
}

if (import.meta.env.DEV) {
  window.__q_log = () => useLog().data.value
}
