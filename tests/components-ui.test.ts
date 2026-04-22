// @vitest-environment jsdom

import { readFileSync } from 'node:fs'

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

const {
  mockCommonState,
  mockConf,
  mockElmGetterGet,
  mockElmGetterRm,
  mockInitJobList,
  mockInitPager,
  mockInitUser,
  mockInitCookie,
  mockInitModel,
  mockRegisterWindowAgentBridge,
  mockResetFilter,
  mockPauseBatch,
  mockResumeBatch,
  mockStartBatch,
  mockUnregister,
} = vi.hoisted(() => ({
  mockCommonState: {
    deliverLock: false,
    deliverState: 'idle',
    deliverStatusMessage: '未开始',
    deliverStop: false,
  },
  mockConf: {
    confInit: vi.fn(async () => {}),
    formData: {
      deliveryLimit: { value: 120 },
    },
  },
  mockElmGetterGet: vi.fn(),
  mockElmGetterRm: vi.fn(async () => {}),
  mockInitCookie: vi.fn(async () => {}),
  mockInitJobList: vi.fn(async () => {}),
  mockInitModel: vi.fn(async () => {}),
  mockInitPager: vi.fn(async () => {}),
  mockInitUser: vi.fn(async () => {}),
  mockPauseBatch: vi.fn(async () => {}),
  mockRegisterWindowAgentBridge: vi.fn(() => mockUnregister),
  mockResetFilter: vi.fn(),
  mockResumeBatch: vi.fn(async () => {}),
  mockStartBatch: vi.fn(async () => {}),
  mockUnregister: vi.fn(),
}))

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return {
    ...actual,
    useMouse: () => ({ x: ref(10), y: ref(20) }),
    useMouseInElement: () => ({ isOutside: ref(true) }),
  }
})

vi.mock('@/stores/conf', () => ({
  useConf: () => mockConf,
}))

vi.mock('@/stores/common', () => ({
  useCommon: () => mockCommonState,
}))

vi.mock('@/stores/jobs', () => ({
  jobList: {
    initJobList: mockInitJobList,
    list: [],
  },
}))

vi.mock('@/stores/user', () => ({
  useUser: () => ({
    info: {
      showName: '测试账号',
    },
    initCookie: mockInitCookie,
    initUser: mockInitUser,
  }),
}))

vi.mock('@/composables/useModel', () => ({
  useModel: () => ({
    initModel: mockInitModel,
  }),
}))

vi.mock('@/stores/statistics', () => ({
  useStatistics: () => ({
    todayData: {
      success: 3,
      total: 5,
    },
  }),
}))

vi.mock('@/pages/zhipin/hooks/usePager', () => ({
  usePager: () => ({
    initPager: mockInitPager,
  }),
}))

vi.mock('@/pages/zhipin/hooks/useDeliveryControl', () => ({
  useDeliveryControl: () => ({
    pauseBatch: mockPauseBatch,
    registerWindowAgentBridge: mockRegisterWindowAgentBridge,
    resetFilter: mockResetFilter,
    resumeBatch: mockResumeBatch,
    startBatch: mockStartBatch,
  }),
}))

vi.mock('@/pages/zhipin/hooks/useDeliver', () => ({
  useDeliver: () => ({
    current: 0,
    total: 2,
  }),
}))

vi.mock('@/utils/elmGetter', () => ({
  elmGetter: {
    get: mockElmGetterGet,
    rm: mockElmGetterRm,
  },
}))

import Ui from '@/pages/zhipin/components/Ui.vue'

const passthrough = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    props: ['label', 'modelValue'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h(
          tag,
          {
            ...attrs,
            onClick: () => {
              if ('modelValue' in props) {
                emit('update:modelValue', !props.modelValue)
              }
            },
          },
          slots.default?.() ?? props.label,
        )
    },
  })

describe('Ui.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div class="page-jobs-main"></div>'
    window.history.replaceState({}, '', '/web/geek/jobs')
    mockCommonState.deliverLock = false
    mockCommonState.deliverState = 'idle'
    mockCommonState.deliverStatusMessage = '未开始'
    mockCommonState.deliverStop = false
    mockElmGetterGet.mockReset()
    mockElmGetterRm.mockReset()
    mockElmGetterGet.mockResolvedValue([])
    mockInitJobList.mockReset()
    mockInitPager.mockReset()
    mockInitUser.mockReset()
    mockInitCookie.mockReset()
    mockInitModel.mockReset()
    mockRegisterWindowAgentBridge.mockClear()
    mockPauseBatch.mockReset()
    mockResetFilter.mockReset()
    mockResumeBatch.mockReset()
    mockStartBatch.mockReset()
    mockUnregister.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes stores, rearranges jobs search layout and cleans up on unmount', async () => {
    const searchEl = document.createElement('div')
    const conditionEl = document.createElement('div')
    const searchInputEl = document.createElement('div')
    const expectSelectEl = document.createElement('div')
    const nestedConditionEl = document.createElement('div')
    const dropdownEl = document.createElement('div')
    conditionEl.className = 'filter-condition'
    nestedConditionEl.className = 'c-filter-condition'
    dropdownEl.className = 'filter-select-dropdown'
    conditionEl.appendChild(nestedConditionEl)
    conditionEl.appendChild(dropdownEl)

    mockElmGetterGet
      .mockResolvedValueOnce([searchEl, conditionEl])
      .mockResolvedValueOnce([searchInputEl, expectSelectEl])

    const wrapper = mount(Ui, {
      attachTo: document.body,
      global: {
        stubs: {
          About: true,
          Card: true,
          Config: true,
          ElCheckbox: passthrough('button'),
          ElConfigProvider: passthrough('div'),
          ElTabPane: passthrough('section'),
          ElTabs: passthrough('div'),
          ElText: passthrough('span'),
          ElTooltip: passthrough('div'),
          Logs: true,
          Statistics: true,
          Teleport: true,
        },
      },
    })

    await flushPromises()

    expect(mockRegisterWindowAgentBridge).toHaveBeenCalledTimes(1)
    expect(mockInitJobList).toHaveBeenCalledWith(mockConf.formData)
    expect(mockInitUser).toHaveBeenCalledTimes(1)
    expect(mockInitCookie).toHaveBeenCalledTimes(1)
    expect(mockInitModel).toHaveBeenCalledTimes(1)
    expect(mockInitPager).toHaveBeenCalledTimes(1)
    expect(searchEl.classList.contains('boss-helper-host-search-static')).toBe(true)
    expect(searchEl.style.display).toBe('none')
    expect(searchEl.style.getPropertyPriority('display')).toBe('important')
    expect(searchEl.getAttribute('aria-hidden')).toBe('true')
    expect(conditionEl.classList.contains('boss-helper-host-search-static--jobs-condition')).toBe(true)
    expect(conditionEl.style.getPropertyValue('position')).toBe('static')
    expect(conditionEl.style.getPropertyPriority('position')).toBe('important')
    expect(conditionEl.style.getPropertyValue('overflow')).toBe('visible')
    expect(conditionEl.style.getPropertyValue('background')).toBe('var(--bh-surface-soft)')
    expect(searchInputEl.classList.contains('boss-helper-host-search-static--jobs-input')).toBe(true)
    expect(searchInputEl.style.getPropertyValue('overflow')).toBe('visible')
    expect(expectSelectEl.classList.contains('boss-helper-host-search-static--jobs-expect')).toBe(true)
    expect(expectSelectEl.style.getPropertyValue('overflow')).toBe('visible')
    expect(searchInputEl.parentElement).toBe(conditionEl.parentElement)
    expect(expectSelectEl.parentElement).toBe(conditionEl.parentElement)
    expect(nestedConditionEl.style.getPropertyValue('background')).toBe('transparent')
    expect(dropdownEl.style.getPropertyValue('z-index')).toBe('1300')

    conditionEl.style.setProperty('position', 'fixed')
    await Promise.resolve()
    await Promise.resolve()
    expect(conditionEl.style.getPropertyValue('position')).toBe('static')
    expect(conditionEl.style.getPropertyPriority('position')).toBe('important')

    expect(wrapper.text()).toContain('今日投递: 3/120')
    expect(wrapper.text()).toContain('主工作区')
    expect(wrapper.text()).toContain('运行状态')

    wrapper.unmount()
    expect(mockUnregister).toHaveBeenCalledTimes(1)
  })

  it('keeps config help attributes addressable without remote update UI', async () => {
    document.body.innerHTML = '<div class="page-jobs-main"></div>'

    const wrapper = mount(Ui, {
      attachTo: document.body,
      global: {
        stubs: {
          About: true,
          Card: true,
          Config: true,
          ElCheckbox: passthrough('button'),
          ElConfigProvider: passthrough('div'),
          ElTabPane: passthrough('section'),
          ElTabs: passthrough('div'),
          ElText: passthrough('span'),
          ElTooltip: passthrough('div'),
          Logs: true,
          Statistics: true,
          Teleport: true,
        },
      },
    })

    await flushPromises()

    expect(wrapper.find('[data-help="集中管理筛选、投递、外观和 AI 相关配置。"]').exists()).toBe(
      true,
    )
    expect(
      wrapper
        .find(
          '[data-help="这里承载 Boss 页面原生的搜索与筛选模块，功能保持原样，仅调整到工作台中展示。"]',
        )
        .exists(),
    ).toBe(true)
    expect(wrapper.text()).not.toContain('有更新')

    wrapper.unmount()
  })

  it('avoids elementFromPoint in the help overlay hot path', () => {
    const uiSource = readFileSync('src/pages/zhipin/components/Ui.vue', 'utf8')
    const hookSource = readFileSync('src/pages/zhipin/hooks/useHelpOverlay.ts', 'utf8')

    expect(uiSource).not.toContain('elementFromPoint(')
    expect(hookSource).not.toContain('elementFromPoint(')
    expect(hookSource).toContain("addEventListener('mousemove', handleHelpMouseMove")
  })
})
