// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

describe('useVue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(async () => {
    const { setActiveSelectorRegistry, zhipinSelectors } = await import('@/utils/selectors')
    setActiveSelectorRegistry(zhipinSelectors)
    vi.useRealTimers()
  })

  it('finds and caches the root vue instance until the root selector changes', async () => {
    vi.resetModules()
    const { getRootVue } = await import('@/composables/useVue')
    const { setActiveSelectorRegistry, zhipinSelectors } = await import('@/utils/selectors')

    setActiveSelectorRegistry(zhipinSelectors)
    document.body.innerHTML = '<div id="wrap"></div><div id="alt-root"></div>'
    const rootElement = document.querySelector('#wrap') as Element & { __vue__?: { id: string } }
    const altRootElement = document.querySelector('#alt-root') as Element & { __vue__?: { id: string } }
    rootElement.__vue__ = { id: 'root' }
    altRootElement.__vue__ = { id: 'alt' }

    const firstPromise = getRootVue()
    await vi.advanceTimersByTimeAsync(300)
    const first = await firstPromise

    expect(first).toEqual(rootElement.__vue__)
    expect(await getRootVue()).toBe(first)

    setActiveSelectorRegistry({
      ...zhipinSelectors,
      root: '#alt-root',
    })

    const secondPromise = getRootVue()
    await vi.advanceTimersByTimeAsync(300)
    await expect(secondPromise).resolves.toEqual(altRootElement.__vue__)
  })

  it('hooks vue data updates back into a ref', async () => {
    vi.resetModules()
    const { useHookVueData } = await import('@/composables/useVue')

    document.body.innerHTML = '<div class="job-card"></div>'
    const element = document.querySelector('.job-card') as Element & { __vue__?: Record<string, unknown> }
    const instance = { status: 'ready' }
    element.__vue__ = instance
    const status = ref('')
    const update = vi.fn()

    const hookPromise = useHookVueData('.job-card', 'status', status, update)()
    await vi.advanceTimersByTimeAsync(100)
    await hookPromise

    expect(status.value).toBe('ready')
    expect(update).toHaveBeenCalledWith('ready')

    instance.status = 'done'

    expect(status.value).toBe('done')
    expect(update).toHaveBeenLastCalledWith('done')
  })

  it('resolves the first available vue method from a fallback list', async () => {
    vi.resetModules()
    const { useHookVueFn } = await import('@/composables/useVue')

    document.body.innerHTML = '<div class="job-panel"></div>'
    const element = document.querySelector('.job-panel') as Element & { __vue__?: Record<string, unknown> }
    const open = vi.fn()
    element.__vue__ = { open }

    const fnPromise = useHookVueFn('.job-panel', ['missing', 'open'])()
    await vi.advanceTimersByTimeAsync(100)

    await expect(fnPromise).resolves.toBe(open)
  })
})
