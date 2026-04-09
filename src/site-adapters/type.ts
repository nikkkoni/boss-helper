import type { BossHelperAgentNavigatePayload } from '@/message/agent'
import type { MyJobListData, JobStatus } from '@/stores/jobs'
import type { PipelineCacheItem } from '@/types/pipelineCache'
import type { SelectorRegistry } from '@/utils/selectors'

export interface SiteNavigatePageOptions {
  direction: 'next' | 'prev'
  page: {
    page: number
    pageSize: number
  }
  pageChange?: ((value: number) => void) | null
}

export interface SiteAdapterJobListOptions<TJobItem, TJobDetail> {
  createStatus: (
    encryptJobId: string,
    cached: Pick<PipelineCacheItem, 'message' | 'status'> | null,
  ) => {
    msg: string
    setStatus: (status: JobStatus, msg?: string) => void
    status: JobStatus
  }
  currentJobs: readonly MyJobListData[]
  getCachedResult: (encryptJobId: string) => PipelineCacheItem | null
  loadJobDetail: (item: TJobItem) => Promise<TJobDetail>
  onCardLoaded: (encryptJobId: string, card: NonNullable<MyJobListData['card']>) => void
}

export interface SitePageModule {
  run: () => Promise<unknown> | unknown
}

export interface SiteAdapterVueBindings {
  clickJobCardActionKey: string
  jobDetailKey: string
  jobListKey: string
}

export interface SiteAdapterPagerBindings {
  pageChangeMethodKeys: readonly string[]
  pageChangeSelectorKey: string
  pageStateKey: string
  pageStateSelectorKey: string
}

export type SiteSearchPanelPlan =
  | {
      kind: 'jobs'
      blockSelectors: readonly string[]
      inputSelectors: readonly string[]
    }
  | {
      kind: 'legacy'
      blockSelectors: readonly string[]
      scanSelector: string
    }
  | {
      kind: 'recommend'
      searchSelector: string
    }

export interface SiteAdapter<TJobItem = unknown, TJobDetail = unknown> {
  applyToJob(job: TJobItem): Promise<unknown>
  buildNavigateUrl(
    payload: BossHelperAgentNavigatePayload | undefined,
    currentUrl: string,
    origin: string,
  ): string
  getSelectors(): SelectorRegistry
  getPagerBindings(pathname?: string): SiteAdapterPagerBindings
  getSearchPanelPlan(pathname?: string): SiteSearchPanelPlan
  getVueBindings(pathname?: string): SiteAdapterVueBindings
  id: string
  loadPageModule(): Promise<SitePageModule>
  matches(url?: string): boolean
  navigatePage(options: SiteNavigatePageOptions): boolean
  parseJobDetail(detail: TJobDetail): NonNullable<MyJobListData['card']>
  parseJobList(
    items: readonly TJobItem[],
    options: SiteAdapterJobListOptions<TJobItem, TJobDetail>,
  ): MyJobListData[]
  shouldStopOnRepeatedJobList(pathname?: string): boolean
}
