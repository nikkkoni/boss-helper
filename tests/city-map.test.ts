import { describe, expect, it } from 'vitest'

import { resolveBossCityCode } from '@/site-adapters/zhipin/cityMap'

describe('resolveBossCityCode', () => {
  it('resolves known city names to 9-digit codes', () => {
    expect(resolveBossCityCode('北京')).toBe('101010100')
    expect(resolveBossCityCode('上海')).toBe('101020100')
    expect(resolveBossCityCode('杭州')).toBe('101210100')
    expect(resolveBossCityCode('湖州')).toBe('101210200')
    expect(resolveBossCityCode('深圳')).toBe('101280600')
  })

  it('passes through numeric codes as-is', () => {
    expect(resolveBossCityCode('101210100')).toBe('101210100')
    expect(resolveBossCityCode('101010100')).toBe('101010100')
  })

  it('passes through unrecognized names as-is', () => {
    expect(resolveBossCityCode('安吉')).toBe('安吉')
    expect(resolveBossCityCode('未知城市')).toBe('未知城市')
  })

  it('trims whitespace', () => {
    expect(resolveBossCityCode('  杭州  ')).toBe('101210100')
    expect(resolveBossCityCode('  ')).toBe('')
  })

  it('returns empty for empty input', () => {
    expect(resolveBossCityCode('')).toBe('')
  })
})
