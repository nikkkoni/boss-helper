// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  collectSelectorHealth,
  formatSelectorHealth,
  getActiveSelectorRegistry,
  getMountContainerSelectors,
  getSelectorHealthExpectations,
  getVueContainerSelectors,
  isSupportedZhipinRoute,
  setActiveSelectorRegistry,
  waitForDocumentReady,
  zhipinSelectors,
} from '@/utils/selectors'

describe('selectors extended', () => {
  beforeEach(() => {
    setActiveSelectorRegistry(zhipinSelectors)
  })

  afterEach(() => {
    vi.useRealTimers()
    setActiveSelectorRegistry(zhipinSelectors)
  })

  it('supports registry swapping and unknown-route fallbacks', () => {
    const customRegistry = {
      ...zhipinSelectors,
      mountContainers: {
        ...zhipinSelectors.mountContainers,
        all: ['.custom-all'],
      },
      vueContainers: {
        ...zhipinSelectors.vueContainers,
        all: ['.custom-vue'],
      },
    }

    setActiveSelectorRegistry(customRegistry)

    expect(getActiveSelectorRegistry()).toBe(customRegistry)
    expect(getMountContainerSelectors('/web/geek/unknown', customRegistry)).toEqual(['.custom-all'])
    expect(getVueContainerSelectors('/web/geek/unknown', customRegistry)).toEqual(['.custom-vue'])
    expect(isSupportedZhipinRoute('/web/geek/job')).toBe(true)
    expect(isSupportedZhipinRoute('/web/geek/chat')).toBe(false)
  })

  it('waits for document readiness and times out when DOMContentLoaded never arrives', async () => {
    vi.useFakeTimers()
    const readyStateDescriptor = Object.getOwnPropertyDescriptor(document, 'readyState')
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    })

    const readyPromise = waitForDocumentReady(1000)
    document.dispatchEvent(new Event('DOMContentLoaded'))
    await expect(readyPromise).resolves.toBeUndefined()

    const timeoutPromise = waitForDocumentReady(500)
    const timeoutErrorPromise = timeoutPromise.catch((error) => error)
    await vi.advanceTimersByTimeAsync(500)
    expect(await timeoutErrorPromise).toEqual(expect.objectContaining({ message: '等待文档就绪超时 (500ms)' }))

    if (readyStateDescriptor) {
      Object.defineProperty(document, 'readyState', readyStateDescriptor)
    }
  })

  it('formats selector health output for empty and mixed result sets', () => {
    expect(getSelectorHealthExpectations('/web/geek/chat')).toEqual([])
    expect(formatSelectorHealth([])).toBe('no selector checks')

    const results = collectSelectorHealth('/web/geek/jobs', {
      querySelector(selector: string) {
        return selector === '#wrap' || selector === '.page-jobs-main'
          ? ({ selector } as unknown as Element)
          : null
      },
    })

    expect(results).toEqual([
      expect.objectContaining({ label: 'root', ok: true }),
      expect.objectContaining({ label: 'mount-container', ok: true }),
      expect.objectContaining({ label: 'vue-container', ok: true }),
    ])
    expect(formatSelectorHealth(results)).toContain('root=ok matched:[#wrap] missing:[none]')
  })
})
