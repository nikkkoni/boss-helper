// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePager } from '@/pages/zhipin/hooks/usePager'

import { setupPinia } from './helpers/pinia'

const pagerMocks = vi.hoisted(() => ({
  getActiveSiteAdapter: vi.fn(),
  getActiveSelectorRegistry: vi.fn(() => ({
    vueContainers: {
      all: ['.page-all'],
      pager: ['.page-pager'],
    },
  })),
  joinSelectors: vi.fn((selectors: string[]) => selectors.join(', ')),
  logger: {
    error: vi.fn(),
  },
  useHookVueData: vi.fn(),
  useHookVueFn: vi.fn(),
}))

vi.mock('@/composables/useVue', () => ({
  useHookVueData: pagerMocks.useHookVueData,
  useHookVueFn: pagerMocks.useHookVueFn,
}))

vi.mock('@/site-adapters', () => ({
  getActiveSiteAdapter: pagerMocks.getActiveSiteAdapter,
}))

vi.mock('@/utils/logger', () => ({
  logger: pagerMocks.logger,
}))

vi.mock('@/utils/selectors', () => ({
  getActiveSelectorRegistry: pagerMocks.getActiveSelectorRegistry,
  joinSelectors: pagerMocks.joinSelectors,
}))

describe('usePager', () => {
  beforeEach(() => {
    setupPinia()
    pagerMocks.getActiveSiteAdapter.mockReset()
    pagerMocks.getActiveSelectorRegistry.mockClear()
    pagerMocks.joinSelectors.mockClear()
    pagerMocks.logger.error.mockReset()
    pagerMocks.useHookVueData.mockReset()
    pagerMocks.useHookVueFn.mockReset()
    window.history.replaceState({}, '', '/web/geek/job')
  })

  it('returns false when next or prev is called before initPager', () => {
    const navigatePage = vi.fn()
    pagerMocks.getActiveSiteAdapter.mockReturnValue({ navigatePage })

    const pager = usePager()

    expect(pager.next()).toBe(false)
    expect(pager.prev()).toBe(false)
    expect(navigatePage).not.toHaveBeenCalled()
    expect(pagerMocks.logger.error).toHaveBeenCalledTimes(2)
  })

  it('hydrates pager bindings and navigates with the active adapter', async () => {
    const changePage = vi.fn()
    const navigatePage = vi.fn((payload: Record<string, unknown>) => payload.direction === 'next')
    pagerMocks.getActiveSiteAdapter.mockReturnValue({
      getPagerBindings: vi.fn(() => ({
        pageChangeMethodKeys: ['pageChangeAction'],
        pageChangeSelectorKey: 'pager',
        pageStateKey: 'pageVo',
        pageStateSelectorKey: 'all',
      })),
      navigatePage,
    })
    pagerMocks.useHookVueData.mockImplementation(
      (_selectors: string, _key: string, pageRef: { value: { page: number; pageSize: number } }) => {
        return async () => {
          pageRef.value = { page: 3, pageSize: 20 }
        }
      },
    )
    pagerMocks.useHookVueFn.mockImplementation(() => async () => changePage)

    const pager = usePager()
    await pager.initPager()

    expect(pager.page).toEqual({ page: 3, pageSize: 20 })
    expect(pager.pageChange).toBe(changePage)
    expect(pagerMocks.joinSelectors).toHaveBeenCalledWith(['.page-all'])
    expect(pagerMocks.joinSelectors).toHaveBeenCalledWith(['.page-pager'])

    expect(pager.next()).toBe(true)
    expect(pager.prev()).toBe(false)
    expect(navigatePage).toHaveBeenNthCalledWith(1, {
      direction: 'next',
      page: { page: 3, pageSize: 20 },
      pageChange: changePage,
    })
    expect(navigatePage).toHaveBeenNthCalledWith(2, {
      direction: 'prev',
      page: { page: 3, pageSize: 20 },
      pageChange: changePage,
    })

    pager.reset()
    expect(pager.page).toEqual({ page: 1, pageSize: 15 })
    expect(pager.pageChange).toBeNull()
  })

  it('deduplicates concurrent initPager calls', async () => {
    const changePage = vi.fn()
    let resolveInitPage!: () => void
    pagerMocks.getActiveSiteAdapter.mockReturnValue({
      getPagerBindings: vi.fn(() => ({
        pageChangeMethodKeys: ['pageChangeAction'],
        pageChangeSelectorKey: 'pager',
        pageStateKey: 'pageVo',
        pageStateSelectorKey: 'all',
      })),
      navigatePage: vi.fn(),
    })
    pagerMocks.useHookVueData.mockImplementation(
      (_selectors: string, _key: string, pageRef: { value: { page: number; pageSize: number } }) => {
        return () =>
          new Promise<void>((resolve) => {
            resolveInitPage = () => {
              pageRef.value = { page: 2, pageSize: 30 }
              resolve()
            }
          })
      },
    )
    pagerMocks.useHookVueFn.mockImplementation(() => async () => changePage)

    const pager = usePager()
    const firstInit = pager.initPager()
    const secondInit = pager.initPager()

    expect(pagerMocks.useHookVueData).toHaveBeenCalledTimes(1)
    expect(pagerMocks.useHookVueFn).toHaveBeenCalledTimes(1)

    resolveInitPage()
    await Promise.all([firstInit, secondInit])

    expect(pager.page).toEqual({ page: 2, pageSize: 30 })
    expect(pager.pageChange).toBe(changePage)
  })
})
