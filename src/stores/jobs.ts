import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch, type Ref } from 'vue'

import { checkJobCache, getReadyCacheManager } from '@/composables/useApplying'
import { useHookVueData, useHookVueFn } from '@/composables/useVue'
import { getActiveSiteAdapter } from '@/site-adapters'
import type { FormData } from '@/types/formData'
import type { PipelineCacheItem } from '@/types/pipelineCache'
import { logger } from '@/utils/logger'
import { getActiveSelectorRegistry, joinSelectors } from '@/utils/selectors'

export type EncryptJobId = bossZpJobItemData['encryptJobId']
export type JobStatus = 'pending' | 'wait' | 'running' | 'success' | 'error' | 'warn'
export type MyJobListData = bossZpJobItemData & {
  card?: bossZpDetailData & bossZpCardData
  status: {
    status: JobStatus
    msg: string
    setStatus: (status: JobStatus, msg?: string) => void
  }
  getCard: () => Promise<bossZpCardData>
}

export async function waitForJobDetail(options: {
  clickJobCardAction: (item: bossZpJobItemData) => Promise<void>
  item: bossZpJobItemData
  jobDetail: Ref<bossZpDetailData | undefined>
}) {
  const { clickJobCardAction, item, jobDetail } = options
  await clickJobCardAction(item)

  return new Promise<bossZpDetailData>((resolve, reject) => {
    let settled = false
    let timeout = 0
    let stop = () => {}

    const cleanup = () => {
      stop()
      if (timeout) {
        window.clearTimeout(timeout)
      }
    }

    const finish = (callback: () => void) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      callback()
    }

    const handleDetail = (detail?: bossZpDetailData) => {
      if (detail && detail.lid === item.lid) {
        finish(() => resolve(detail))
      }
    }

    stop = watch(
      () => jobDetail.value,
      (detail) => {
        handleDetail(detail)
      },
      {
        flush: 'sync',
      },
    )

    timeout = window.setTimeout(() => {
      finish(() => reject(new Error('bossZpDetailData获取超时')))
    }, 1000 * 60)

    handleDetail(jobDetail.value)
  })
}

const useJobsStore = defineStore('jobs', () => {
  const vueJobList = ref<bossZpJobItemData[]>([])
  const vueJobDetail = ref<bossZpDetailData>()
  const list = ref<Array<MyJobListData>>([])
  const useCache = ref(true)
  const map = computed<Record<EncryptJobId, MyJobListData>>(() => {
    return Object.fromEntries(list.value.map((item) => [item.encryptJobId, item])) as Record<
      EncryptJobId,
      MyJobListData
    >
  })

  let clickJobCardAction = async (_: bossZpJobItemData) => {}

  function getVueContainerQuery() {
    return joinSelectors(getActiveSelectorRegistry().vueContainers.all)
  }

  function get(encryptJobId: EncryptJobId): MyJobListData | undefined {
    return map.value[encryptJobId]
  }

  function replace(nextList: MyJobListData[]) {
    list.value = nextList
  }

  function clear() {
    list.value = []
  }

  function set(encryptJobId: EncryptJobId, value: MyJobListData) {
    const index = list.value.findIndex((item) => item.encryptJobId === encryptJobId)
    if (index === -1) {
      list.value = [...list.value, value]
      return
    }

    const nextList = [...list.value]
    nextList.splice(index, 1, value)
    list.value = nextList
  }

  function createJobStatus(
    encryptJobId: string,
    cacheCheck: Pick<PipelineCacheItem, 'message' | 'status'> | null,
  ) {
    return {
      status: cacheCheck ? cacheCheck.status : 'pending',
      msg: cacheCheck ? `${cacheCheck.message} (缓存)` : '未开始',
      setStatus: (status: JobStatus, msg?: string) => {
        const target = get(encryptJobId)
        if (!target) {
          return
        }
        target.status.status = status
        target.status.msg = msg ?? ''
      },
    }
  }

  async function loadJobDetail(item: bossZpJobItemData) {
    return waitForJobDetail({
      clickJobCardAction,
      item,
      jobDetail: vueJobDetail,
    })
  }

  function syncJobList(items: bossZpJobItemData[]) {
    logger.debug('初始化岗位列表', items)

    const adapter = getActiveSiteAdapter(location.href)
    const nextList = adapter.parseJobList(items, {
      currentJobs: list.value,
      getCachedResult: (encryptJobId) => (useCache.value ? checkJobCache(encryptJobId) : null),
      createStatus: (encryptJobId, cacheCheck) => createJobStatus(encryptJobId, cacheCheck),
      loadJobDetail: (item) => loadJobDetail(item),
      onCardLoaded: (encryptJobId, card) => {
        const target = get(encryptJobId)
        if (target) {
          target.card = card
        }
      },
    })

    replace(nextList)
  }

  async function initJobList(formData: FormData) {
    useCache.value = formData.useCache.value
    if (useCache.value) {
      await getReadyCacheManager()
    }

    const adapter = getActiveSiteAdapter(location.href)
    const bindings = adapter.getVueBindings(location.pathname)
    const vueContainerQuery = getVueContainerQuery()
    const hookJobDetail = useHookVueData(vueContainerQuery, bindings.jobDetailKey, vueJobDetail)
    const hookClickJobCardAction = useHookVueFn<(_: bossZpJobItemData) => Promise<void>>(
      vueContainerQuery,
      bindings.clickJobCardActionKey,
    )
    const hookJobList = useHookVueData(
      vueContainerQuery,
      bindings.jobListKey,
      vueJobList,
      (value) => {
        syncJobList(value)
      },
    )

    await hookJobDetail()
    clickJobCardAction = await hookClickJobCardAction()
    await hookJobList()
  }

  return {
    list,
    map,
    useCache,
    initJobList,
    get,
    set,
    clear,
    replace,
    syncJobList,
    loadJobDetail,
  }
})

/**
 * Vue 组件中优先使用的 jobs store 入口。
 *
 * 它返回 `storeToRefs` 包装后的字段，适合模板绑定和组件生命周期内消费。
 */
export function useJobs() {
  const store = useJobsStore()
  const refs = storeToRefs(store)

  return {
    ...refs,
    initJobList: store.initJobList,
    get: store.get,
    set: store.set,
    clear: store.clear,
    replace: store.replace,
    syncJobList: store.syncJobList,
    loadJobDetail: store.loadJobDetail,
  }
}

/**
 * 命令式代码中优先使用的 jobs store 入口。
 *
 * 它跨过 `storeToRefs` 包装，适合 service、hook 和测试里的同步读写。
 */
export const jobList = {
  get list() {
    return useJobsStore().list
  },
  get map() {
    return useJobsStore().map
  },
  get useCache() {
    return useJobsStore().useCache
  },
  initJobList(formData: FormData) {
    return useJobsStore().initJobList(formData)
  },
  get(encryptJobId: EncryptJobId) {
    return useJobsStore().get(encryptJobId)
  },
  set(encryptJobId: EncryptJobId, value: MyJobListData) {
    return useJobsStore().set(encryptJobId, value)
  },
  clear() {
    return useJobsStore().clear()
  },
  replace(nextList: MyJobListData[]) {
    return useJobsStore().replace(nextList)
  },
}

if (import.meta.env.DEV) {
  window.__q_jobList = jobList
}
