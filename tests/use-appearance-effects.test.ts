// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

import { __resetAppearanceConfigStateForTests } from '@/pages/zhipin/hooks/useAppearanceConfig'

import { setupPinia } from './helpers/pinia'
import { __resetMessageMock, __setStorageItem } from './mocks/message'

describe('useAppearanceEffects', () => {
  beforeEach(() => {
    setupPinia()
    __resetMessageMock()
    __resetAppearanceConfigStateForTests()
    document.head.innerHTML = '<title>Boss 页面</title><link rel="icon" href="https://example.com/original.ico">'
    document.body.innerHTML = '<div id="header"></div><div id="boss-helper-job-wrap"></div>'
  })

  it('applies and restores page side effects from persisted appearance config', async () => {
    __setStorageItem('appearance-conf', {
      blurCard: false,
      changeBackground: false,
      changeIcon: true,
      dynamicTitle: true,
      hideHeader: true,
      listSink: true,
    })

    const { useAppearanceEffects } = await import('@/pages/zhipin/hooks/useAppearanceEffects')
    const { useConf } = await import('@/stores/conf')
    const { useStatistics } = await import('@/stores/statistics')

    const conf = useConf()
    conf.formData.deliveryLimit.value = 120
    const stats = useStatistics()
    stats.todayData.success = 7

    const wrapper = mount(
      defineComponent({
        name: 'AppearanceEffectsHarness',
        setup() {
          useAppearanceEffects()
          return () => null
        },
      }),
      {
        attachTo: document.body,
      },
    )

    await flushPromises()

    const header = document.getElementById('header')
    const listWrap = document.getElementById('boss-helper-job-wrap')
    const favicon = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]')

    expect(header?.style.display).toBe('none')
    expect(listWrap?.style.marginBottom).toBe('300px')
    expect(document.title).toBe('7/120 - 在线计算器')
    expect(favicon?.getAttribute('href')).toBe('https://onlinecalculator.cc/public/favicon.svg')

    wrapper.unmount()

    expect(header?.style.display).toBe('')
    expect(listWrap?.style.marginBottom).toBe('')
    expect(document.title).toBe('Boss 页面')
    expect(favicon?.getAttribute('href')).toBe('https://example.com/original.ico')
  })
})
