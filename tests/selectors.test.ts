import { describe, expect, it } from 'vitest'

import {
  collectSelectorHealth,
  getMountContainerSelectors,
  getVueContainerSelectors,
  getZhipinRouteKind,
  joinSelectors,
  splitSelectors,
  zhipinSelectors,
} from '@/utils/selectors'

function createQueryRoot(foundSelectors: string[]) {
  const available = new Set(foundSelectors)

  return {
    querySelector(selector: string) {
      return available.has(selector) ? ({ selector } as unknown as Element) : null
    },
  } as Pick<ParentNode, 'querySelector'>
}

describe('selectors', () => {
  it('maps supported routes to route kinds', () => {
    expect(getZhipinRouteKind('/web/geek/job')).toBe('job')
    expect(getZhipinRouteKind('/web/geek/job-recommend')).toBe('job-recommend')
    expect(getZhipinRouteKind('/web/geek/jobs')).toBe('jobs')
    expect(getZhipinRouteKind('/web/geek/unknown')).toBe('unknown')
  })

  it('normalizes selector lists', () => {
    expect(splitSelectors('a, b ,c')).toEqual(['a', 'b', 'c'])
    expect(joinSelectors(zhipinSelectors.vueContainers.all)).toContain('.page-jobs-main')
  })

  it('builds route specific selector groups', () => {
    expect(getMountContainerSelectors('/web/geek/jobs')).toContain('.page-jobs-main')
    expect(getVueContainerSelectors('/web/geek/job')).toEqual(['#wrap .page-job-wrapper'])
    expect(zhipinSelectors.extension.jobPanelWrapId).toBe('boss-helper-job-wrap')
  })

  it('reports selector health for supported routes', () => {
    const results = collectSelectorHealth(
      '/web/geek/jobs',
      createQueryRoot([zhipinSelectors.root, '.page-jobs-main']),
    )

    expect(results).toHaveLength(3)
    expect(results.every((result) => result.ok)).toBe(true)
  })
})
