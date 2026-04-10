import { reactive, ref, watch } from 'vue'

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

export class JobList {
  private _vue_jobList = ref<bossZpJobItemData[]>([])
  private _vue_jobDetail = ref<bossZpDetailData>()

  _list = ref<Array<MyJobListData>>([])
  _map = reactive<Record<EncryptJobId, MyJobListData>>({})

  _use_cache = ref<boolean>(true)
  private clickJobCardAction = async (_: bossZpJobItemData) => {}

  private getVueContainerQuery() {
    return joinSelectors(getActiveSelectorRegistry().vueContainers.all)
  }

  private createJobStatus(
    encryptJobId: string,
    cacheCheck: Pick<PipelineCacheItem, 'message' | 'status'> | null,
  ) {
    return {
      status: cacheCheck ? cacheCheck.status : 'pending',
      msg: cacheCheck ? `${cacheCheck.message} (缓存)` : '未开始',
      setStatus: (status: JobStatus, msg?: string) => {
        this._map[encryptJobId].status.status = status
        this._map[encryptJobId].status.msg = msg ?? ''
      },
    }
  }

  private async loadJobDetail(item: bossZpJobItemData) {
    await this.clickJobCardAction(item)

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
        () => this._vue_jobDetail.value,
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

      handleDetail(this._vue_jobDetail.value)
    })
  }

  private syncJobList(items: bossZpJobItemData[]) {
    logger.debug('初始化岗位列表', items)

    const adapter = getActiveSiteAdapter(location.href)
    const nextList = adapter.parseJobList(items, {
      currentJobs: this._list.value,
      getCachedResult: (encryptJobId) => (this._use_cache.value ? checkJobCache(encryptJobId) : null),
      createStatus: (encryptJobId, cacheCheck) => this.createJobStatus(encryptJobId, cacheCheck),
      loadJobDetail: (item) => this.loadJobDetail(item),
      onCardLoaded: (encryptJobId, card) => {
        this._map[encryptJobId].card = card
      },
    })

    Object.keys(this._map).forEach((key) => {
      delete this._map[key as EncryptJobId]
    })

    nextList.forEach((item) => {
      this._map[item.encryptJobId] = item
    })
    this._list.value = nextList
  }

  async initJobList(formData: FormData) {
    this._use_cache.value = formData.useCache.value
    if (this._use_cache.value) {
      await getReadyCacheManager()
    }
    const adapter = getActiveSiteAdapter(location.href)
    const bindings = adapter.getVueBindings(location.pathname)
    const vueContainerQuery = this.getVueContainerQuery()
    const hookJobDetail = useHookVueData(
      vueContainerQuery,
      bindings.jobDetailKey,
      this._vue_jobDetail,
    )
    const hookClickJobCardAction = useHookVueFn(
      vueContainerQuery,
      bindings.clickJobCardActionKey,
    )
    const hookJobList = useHookVueData(
      vueContainerQuery,
      bindings.jobListKey,
      this._vue_jobList,
      (v) => {
        this.syncJobList(v)
      },
    )

    await hookJobDetail()
    this.clickJobCardAction = await hookClickJobCardAction()
    await hookJobList()
  }

  get(encryptJobId: EncryptJobId): MyJobListData | undefined {
    return this._map[encryptJobId]
  }

  set(encryptJobId: EncryptJobId, val: MyJobListData) {
    this._map[encryptJobId] = val
  }

  get list() {
    return this._list.value
  }

  get map() {
    return this._map
  }
}

export const jobList = new JobList()

if (import.meta.env.DEV) {
  window.__q_jobList = jobList
}
