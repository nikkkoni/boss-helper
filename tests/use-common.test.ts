import { beforeEach, describe, expect, it } from 'vitest'

import { useCommon } from '@/composables/useCommon'

import { setupPinia } from './helpers/pinia'

describe('useCommon', () => {
  beforeEach(() => {
    setupPinia()
  })

  it('exposes the default delivery and app state', () => {
    const common = useCommon()

    expect(common.deliverLock).toBe(false)
    expect(common.deliverStop).toBe(false)
    expect(common.deliverState).toBe('idle')
    expect(common.deliverStatusMessage).toBe('未开始')
    expect(common.appLoading).toBe(false)
  })

  it('shares state across store consumers', () => {
    const first = useCommon()
    const second = useCommon()

    first.deliverState = 'running'
    first.deliverStatusMessage = '处理中'
    first.deliverLock = true

    expect(second.deliverState).toBe('running')
    expect(second.deliverStatusMessage).toBe('处理中')
    expect(second.deliverLock).toBe(true)
  })
})
