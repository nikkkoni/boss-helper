import { describe, expect, it } from 'vitest'

import { buildBossHelperNavigateUrl } from '@/pages/zhipin/hooks/agentNavigate'

describe('buildBossHelperNavigateUrl', () => {
  const currentUrl = 'https://www.zhipin.com/web/geek/jobs?query=java&city=101010100&page=3'
  const origin = 'https://www.zhipin.com'

  it('updates query params and removes page when page is 1', () => {
    expect(
      buildBossHelperNavigateUrl(
        {
          query: ' frontend ',
          city: '101020100',
          position: '100101',
          page: 1,
        },
        currentUrl,
        origin,
      ),
    ).toBe('https://www.zhipin.com/web/geek/jobs?query=frontend&city=101020100&position=100101')
  })

  it('accepts supported absolute or relative job urls', () => {
    expect(
      buildBossHelperNavigateUrl(
        { url: 'https://www.zhipin.com/web/geek/job-recommend' },
        currentUrl,
        origin,
      ),
    ).toBe('https://www.zhipin.com/web/geek/job-recommend')

    expect(
      buildBossHelperNavigateUrl(
        { url: '/web/geek/jobs?page=2' },
        currentUrl,
        origin,
      ),
    ).toBe('https://www.zhipin.com/web/geek/jobs?page=2')
  })

  it('rejects invalid page values and unsupported urls', () => {
    expect(() => buildBossHelperNavigateUrl({ page: 0 }, currentUrl, origin)).toThrow(
      'navigate.page 必须是大于等于 1 的整数',
    )
    expect(() => buildBossHelperNavigateUrl({ url: 'https://www.zhipin.com/web/geek/chat' }, currentUrl, origin)).toThrow(
      'navigate.url 必须指向 Boss 职位搜索页',
    )
  })
})