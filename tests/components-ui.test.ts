// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockConf,
  mockElmGetterGet,
  mockElmGetterRm,
  mockInitJobList,
  mockInitPager,
  mockInitSignedKey,
  mockInitUser,
  mockInitCookie,
  mockInitModel,
  mockRefreshSignedKeyInfo,
  mockRegisterWindowAgentBridge,
  mockUnregister,
} = vi.hoisted(() => ({
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
  mockInitSignedKey: vi.fn(async () => {}),
  mockInitUser: vi.fn(async () => {}),
  mockRefreshSignedKeyInfo: vi.fn(async () => {}),
  mockRegisterWindowAgentBridge: vi.fn(() => mockUnregister),
  mockUnregister: vi.fn(),
}))

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return {
    ...actual,
    useMouse: () => ({ x: { value: 10 }, y: { value: 20 } }),
    useMouseInElement: () => ({ isOutside: { value: true } }),
  }
})

vi.mock('@/stores/conf', () => ({
  useConf: () => mockConf,
}))

vi.mock('@/stores/jobs', () => ({
  jobList: {
    _list: { value: [] },
    initJobList: mockInitJobList,
    list: [],
  },
}))

vi.mock('@/stores/user', () => ({
  useUser: () => ({
    initCookie: mockInitCookie,
    initUser: mockInitUser,
  }),
}))

vi.mock('@/composables/useModel', () => ({
  useModel: () => ({
    initModel: mockInitModel,
  }),
}))

vi.mock('@/stores/signedKey', () => ({
  useSignedKey: () => ({
    initSignedKey: mockInitSignedKey,
    netConf: {
      feedback: 'https://example.com/feedback',
      notification: [],
      version: '0.4.5',
    },
    refreshSignedKeyInfo: mockRefreshSignedKeyInfo,
    signedKey: 'signed-key',
  }),
}))

vi.mock('@/composables/useStatistics', () => ({
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
    registerWindowAgentBridge: mockRegisterWindowAgentBridge,
  }),
}))

vi.mock('@/pages/zhipin/hooks/useDeliver', () => ({
  useDeliver: () => ({
    current: 0,
    total: 2,
  }),
}))

vi.mock('@/utils/elmGetter', () => ({
  default: {
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
    mockElmGetterGet.mockReset()
    mockElmGetterRm.mockReset()
    mockInitJobList.mockReset()
    mockInitPager.mockReset()
    mockInitUser.mockReset()
    mockInitCookie.mockReset()
    mockInitModel.mockReset()
    mockInitSignedKey.mockReset()
    mockRefreshSignedKeyInfo.mockReset()
    mockRegisterWindowAgentBridge.mockClear()
    mockUnregister.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes stores, rearranges jobs search layout and cleans up on unmount', async () => {
    const searchEl = document.createElement('div')
    const conditionEl = document.createElement('div')
    const searchInputEl = document.createElement('input')
    const expectSelectEl = document.createElement('div')

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
          ElBadge: passthrough('div'),
          ElCheckbox: passthrough('button'),
          ElConfigProvider: passthrough('div'),
          ElLink: passthrough('a'),
          ElTabPane: passthrough('section'),
          ElTabs: passthrough('div'),
          ElTag: passthrough('span'),
          ElText: passthrough('span'),
          ElTooltip: passthrough('div'),
          Logs: true,
          Service: true,
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
    expect(mockInitSignedKey).toHaveBeenCalledTimes(1)
    expect(mockInitPager).toHaveBeenCalledTimes(1)
    expect(searchEl.style.display).toBe('none')
    expect(searchInputEl.parentElement).toBe(conditionEl.parentElement)
    expect(expectSelectEl.parentElement).toBe(conditionEl.parentElement)
    expect(wrapper.text()).toContain('今日投递: 3/120')

    vi.advanceTimersByTime(20 * 60 * 1000)
    expect(mockRefreshSignedKeyInfo).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(mockUnregister).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(20 * 60 * 1000)
    expect(mockRefreshSignedKeyInfo).toHaveBeenCalledTimes(1)
  })
})
