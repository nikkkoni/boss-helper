// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const zhipinIndexMocks = vi.hoisted(() => ({
  appMount: vi.fn(),
  appUse: vi.fn(),
  createApp: vi.fn(() => ({
    mount: zhipinIndexMocks.appMount,
    use: zhipinIndexMocks.appUse,
  })),
  createPinia: vi.fn(() => ({ id: 'pinia' })),
  elmGetterGet: vi.fn(),
  elmGetterRm: vi.fn(async () => undefined),
  getActiveSiteAdapter: vi.fn(),
  getMountContainerSelectors: vi.fn(() => ['.job-search-wrapper']),
  initBossChatStream: vi.fn(),
  joinSelectors: vi.fn((selectors: string[]) => selectors.join(',')),
  logger: {
    info: vi.fn(),
  },
}))

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    createApp: zhipinIndexMocks.createApp,
  }
})

vi.mock('pinia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pinia')>()
  return {
    ...actual,
    createPinia: zhipinIndexMocks.createPinia,
  }
})

vi.mock('@/site-adapters', () => ({
  getActiveSiteAdapter: zhipinIndexMocks.getActiveSiteAdapter,
}))

vi.mock('@/utils/elmGetter', () => ({
  elmGetter: {
    get: zhipinIndexMocks.elmGetterGet,
    rm: zhipinIndexMocks.elmGetterRm,
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: zhipinIndexMocks.logger,
}))

vi.mock('@/utils/selectors', () => ({
  SELECTOR_TIMEOUT_MS: 15000,
  getMountContainerSelectors: zhipinIndexMocks.getMountContainerSelectors,
  joinSelectors: zhipinIndexMocks.joinSelectors,
}))

vi.mock('@/pages/zhipin/hooks/useChatStream', () => ({
  initBossChatStream: zhipinIndexMocks.initBossChatStream,
}))

describe('pages/zhipin index', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.history.replaceState({}, '', '/web/geek/jobs')
    zhipinIndexMocks.appMount.mockReset()
    zhipinIndexMocks.appUse.mockReset()
    zhipinIndexMocks.createApp.mockClear()
    zhipinIndexMocks.createPinia.mockClear()
    zhipinIndexMocks.elmGetterGet.mockReset()
    zhipinIndexMocks.elmGetterRm.mockReset()
    zhipinIndexMocks.getActiveSiteAdapter.mockReset()
    zhipinIndexMocks.getMountContainerSelectors.mockClear()
    zhipinIndexMocks.initBossChatStream.mockReset()
    zhipinIndexMocks.joinSelectors.mockClear()
    zhipinIndexMocks.logger.info.mockReset()
  })

  it('mounts the UI into job/recommend wrappers and removes cleanup selectors', async () => {
    const wrapper = document.createElement('div')
    wrapper.className = 'page-jobs-main'
    const firstChild = document.createElement('div')
    firstChild.className = 'existing-first'
    wrapper.append(firstChild)
    document.body.append(wrapper)

    zhipinIndexMocks.elmGetterGet.mockResolvedValue(wrapper)
    zhipinIndexMocks.getActiveSiteAdapter.mockReturnValue({
      getSelectors: vi.fn(() => ({
        cleanup: ['.ad-a', '.ad-b'],
        extension: {
          jobPanel: '#boss-helper-job',
          jobPanelId: 'boss-helper-job',
          jobPanelWrap: '#boss-helper-job-wrap',
          jobPanelWrapId: 'boss-helper-job-wrap',
        },
        getRouteKind: vi.fn(() => 'jobs'),
      })),
    })

    const { run } = await import('@/pages/zhipin')
    await run()

    expect(zhipinIndexMocks.logger.info).toHaveBeenCalledWith('加载/web/geek/job页面Hook')
    expect(zhipinIndexMocks.initBossChatStream).toHaveBeenCalledTimes(1)
    expect(zhipinIndexMocks.joinSelectors).toHaveBeenCalledWith(['.job-search-wrapper'])
    expect(zhipinIndexMocks.elmGetterRm).toHaveBeenCalledTimes(2)
    expect(document.querySelector('#boss-helper-job-wrap')).not.toBeNull()
    expect(document.querySelector('#boss-helper-job')).not.toBeNull()
    expect(wrapper.getAttribute('help')).toBe('出界了哇!')
    expect(zhipinIndexMocks.createPinia).toHaveBeenCalledTimes(1)
    expect(zhipinIndexMocks.appUse).toHaveBeenCalledWith({ id: 'pinia' })
    expect(zhipinIndexMocks.appMount).toHaveBeenCalledWith(expect.any(HTMLDivElement))
  })

  it('skips remounting when the job panel already exists and handles legacy routes', async () => {
    const wrapper = document.createElement('div')
    wrapper.className = 'job-search-wrapper'
    const firstChild = document.createElement('div')
    wrapper.append(firstChild)
    const existingPanel = document.createElement('div')
    existingPanel.id = 'boss-helper-job'
    document.body.append(wrapper, existingPanel)

    zhipinIndexMocks.elmGetterGet.mockResolvedValue(wrapper)
    zhipinIndexMocks.getActiveSiteAdapter.mockReturnValue({
      getSelectors: vi.fn(() => ({
        cleanup: [],
        extension: {
          jobPanel: '#boss-helper-job',
          jobPanelId: 'boss-helper-job',
          jobPanelWrap: '#boss-helper-job-wrap',
          jobPanelWrapId: 'boss-helper-job-wrap',
        },
        getRouteKind: vi.fn(() => 'job'),
      })),
    })

    const { run } = await import('@/pages/zhipin')
    await run()

    expect(zhipinIndexMocks.createApp).not.toHaveBeenCalled()
    expect(zhipinIndexMocks.appMount).not.toHaveBeenCalled()
  })
})
