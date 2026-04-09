import { describe, expect, it } from 'vitest'

import { createZhipinAdapter } from '@/site-adapters/zhipin/adapter'

describe('zhipin site adapter', () => {
  const adapter = createZhipinAdapter()

  it('provides zhipin-specific bindings and page plans', () => {
    expect(adapter.getVueBindings('/web/geek/job')).toEqual({
      clickJobCardActionKey: 'clickJobCardAction',
      jobDetailKey: 'jobDetail',
      jobListKey: 'jobList',
    })

    expect(adapter.getPagerBindings('/web/geek/job')).toEqual({
      pageChangeMethodKeys: ['pageChangeAction'],
      pageChangeSelectorKey: 'job',
      pageStateKey: 'pageVo',
      pageStateSelectorKey: 'all',
    })

    expect(adapter.getPagerBindings('/web/geek/jobs')).toEqual({
      pageChangeMethodKeys: ['searchJobAction', 'onSearch'],
      pageChangeSelectorKey: 'all',
      pageStateKey: 'pageVo',
      pageStateSelectorKey: 'all',
    })

    expect(adapter.getSearchPanelPlan('/web/geek/job-recommend')).toEqual({
      kind: 'recommend',
      searchSelector: '.job-recommend-search',
    })

    expect(adapter.getSearchPanelPlan('/web/geek/jobs')).toEqual({
      kind: 'jobs',
      blockSelectors: ['.page-jobs-main .expect-and-search', '.page-jobs-main .filter-condition'],
      inputSelectors: ['.c-search-input', '.c-expect-select'],
    })

    expect(adapter.getSearchPanelPlan('/web/geek/job')).toEqual({
      kind: 'legacy',
      blockSelectors: [
        '.job-search-wrapper .job-search-box.clearfix',
        '.job-search-wrapper .search-condition-wrapper.clearfix',
      ],
      scanSelector: '.job-search-scan',
    })
  })

  it('builds and validates navigate urls via adapter', () => {
    expect(
      adapter.buildNavigateUrl(
        {
          query: ' frontend ',
          city: '101020100',
          position: '100101',
          page: 1,
        },
        'https://www.zhipin.com/web/geek/jobs?query=java&city=101010100&page=3',
        'https://www.zhipin.com',
      ),
    ).toBe('https://www.zhipin.com/web/geek/jobs?query=frontend&city=101020100&position=100101')

    expect(
      adapter.buildNavigateUrl(
        { url: '/web/geek/jobs?page=2' },
        'https://www.zhipin.com/web/geek/jobs?query=java&city=101010100&page=3',
        'https://www.zhipin.com',
      ),
    ).toBe('https://www.zhipin.com/web/geek/jobs?page=2')

    expect(() =>
      adapter.buildNavigateUrl(
        { url: 'https://www.zhipin.com/web/geek/chat' },
        'https://www.zhipin.com/web/geek/jobs?query=java&city=101010100&page=3',
        'https://www.zhipin.com',
      ),
    ).toThrow('navigate.url 必须指向 Boss 职位搜索页')
  })

  it('detects routes that should stop on repeated job lists', () => {
    expect(adapter.shouldStopOnRepeatedJobList('/web/geek/jobs')).toBe(true)
    expect(adapter.shouldStopOnRepeatedJobList('/web/geek/job-recommend')).toBe(true)
    expect(adapter.shouldStopOnRepeatedJobList('/web/geek/job')).toBe(false)
  })
})
