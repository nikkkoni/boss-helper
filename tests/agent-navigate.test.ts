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

  it('resolves city name to code', () => {
    expect(
      buildBossHelperNavigateUrl({ city: '杭州' }, currentUrl, origin),
    ).toBe('https://www.zhipin.com/web/geek/jobs?query=java&city=101210100&page=3')

    expect(
      buildBossHelperNavigateUrl({ city: '湖州' }, currentUrl, origin),
    ).toBe('https://www.zhipin.com/web/geek/jobs?query=java&city=101210200&page=3')
  })

  it('passes through numeric city code as-is', () => {
    expect(
      buildBossHelperNavigateUrl({ city: '101210200' }, currentUrl, origin),
    ).toBe('https://www.zhipin.com/web/geek/jobs?query=java&city=101210200&page=3')
  })

  it('passes through unrecognized city name as-is', () => {
    const result = buildBossHelperNavigateUrl({ city: '安吉' }, currentUrl, origin)
    expect(new URL(result).searchParams.get('city')).toBe('安吉')
  })

  it('adds multiBusinessDistrict parameter', () => {
    const result = buildBossHelperNavigateUrl({ city: '湖州', multiBusinessDistrict: '330523' }, currentUrl, origin)
    const params = new URL(result).searchParams
    expect(params.get('city')).toBe('101210200')
    expect(params.get('multiBusinessDistrict')).toBe('330523')
  })

  it('removes multiBusinessDistrict when empty', () => {
    const urlWithArea = 'https://www.zhipin.com/web/geek/jobs?city=101210200&multiBusinessDistrict=330523'
    expect(
      buildBossHelperNavigateUrl({ multiBusinessDistrict: '' }, urlWithArea, origin),
    ).toBe('https://www.zhipin.com/web/geek/jobs?city=101210200')
  })

  it('removes legacy areaBusiness when clearing district filter', () => {
    const legacyUrl = 'https://www.zhipin.com/web/geek/jobs?city=101210200&areaBusiness=330523'
    expect(
      buildBossHelperNavigateUrl({ multiBusinessDistrict: '' }, legacyUrl, origin),
    ).toBe('https://www.zhipin.com/web/geek/jobs?city=101210200')
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
    expect(() =>
      buildBossHelperNavigateUrl({ url: 'https://evil.example/web/geek/jobs' }, currentUrl, origin),
    ).toThrow('navigate.url 必须与当前站点同源')
    expect(() =>
      buildBossHelperNavigateUrl({ url: 'javascript:alert(1)' }, currentUrl, origin),
    ).toThrow('navigate.url 协议不合法')
  })
})
