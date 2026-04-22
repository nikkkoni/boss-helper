// @vitest-environment jsdom

import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const isOutside = ref(false)

vi.mock('@vueuse/core', () => ({
  useMouseInElement: () => ({ isOutside }),
}))

describe('useHelpOverlay', () => {
  async function mountHook(options: Parameters<(typeof import('../src/pages/zhipin/hooks/useHelpOverlay'))['useHelpOverlay']>[0]) {
    const { useHelpOverlay } = await import('../src/pages/zhipin/hooks/useHelpOverlay')

    let state: ReturnType<typeof useHelpOverlay> | null = null
    const host = document.createElement('div')
    document.body.append(host)

    const app = createApp({
      setup() {
        state = useHelpOverlay(options)
        return () => h('div')
      },
    })

    app.mount(host)

    return {
      state: state!,
      unmount: () => app.unmount(),
    }
  }

  beforeEach(() => {
    isOutside.value = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('shows overlay styles when hovering a help target', async () => {
    const root = document.createElement('div')
    const target = document.createElement('div')
    target.dataset.help = 'quick-help'
    target.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 10, y: 20, width: 40, height: 30 })

    document.body.append(root)
    root.append(target)

    const getComputedStyleSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockReturnValue({ borderRadius: '6px' } as CSSStyleDeclaration)

    const { state, unmount } = await mountHook({ rootElement: ref(root), visible: ref(true) })

    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    await nextTick()

    expect(state.helpContent.value).toBe('quick-help')
    expect(state.overlayStyles.value.display).toBe('block')
    expect(state.overlayStyles.value.left).toBe('10px')
    expect(state.overlayStyles.value.top).toBe('20px')
    expect(state.overlayStyles.value.borderRadius).toBe('6px')
    expect(state.helpMaxWidth.value).toBe('40px')
    expect(state.tooltipVisible.value).toBe(true)

    getComputedStyleSpy.mockRestore()
    unmount()
  })

  it('hides overlay when outside or when no help target is present', async () => {
    const root = document.createElement('div')
    const target = document.createElement('div')
    target.dataset.help = 'inside-help'
    target.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 })

    const plain = document.createElement('div')
    plain.getBoundingClientRect = target.getBoundingClientRect

    document.body.append(root)
    root.append(target, plain)

    const visible = ref(true)
    const { state, unmount } = await mountHook({ rootElement: ref(root), visible })

    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    await nextTick()

    plain.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    await nextTick()
    expect(state.overlayStyles.value.display).toBe('none')

    visible.value = false
    isOutside.value = true
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    await nextTick()

    expect(state.overlayStyles.value.display).toBe('none')
    expect(state.tooltipVisible.value).toBe(false)
    unmount()
  })
})
