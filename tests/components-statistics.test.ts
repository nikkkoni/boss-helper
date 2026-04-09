// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockPauseBatch,
  mockResetFilter,
  mockResumeBatch,
  mockStartBatch,
  mockUpdateStatistics,
} = vi.hoisted(() => ({
  mockPauseBatch: vi.fn(),
  mockResetFilter: vi.fn(),
  mockResumeBatch: vi.fn(),
  mockStartBatch: vi.fn(),
  mockUpdateStatistics: vi.fn(async () => {}),
}))

vi.mock('@/composables/useCommon', () => ({
  useCommon: () => ({
    deliverLock: false,
    deliverState: 'idle',
    deliverStop: false,
  }),
}))

vi.mock('@/composables/useStatistics', () => ({
  useStatistics: () => ({
    statisticsData: [],
    todayData: {
      activityFilter: 2,
      aiRequestCount: 4,
      aiTotalCost: 0.123456,
      aiTotalTokens: 12000,
      repeat: 1,
      success: 3,
      total: 10,
    },
    updateStatistics: mockUpdateStatistics,
  }),
}))

vi.mock('@/stores/conf', () => ({
  useConf: () => ({
    config_level: {
      intermediate: true,
    },
    formData: {
      deliveryLimit: {
        value: 120,
      },
    },
  }),
}))

vi.mock('@/pages/zhipin/hooks/useDeliveryControl', () => ({
  useDeliveryControl: () => ({
    pauseBatch: mockPauseBatch,
    resetFilter: mockResetFilter,
    resumeBatch: mockResumeBatch,
    startBatch: mockStartBatch,
  }),
}))

import Statistics from '@/pages/zhipin/components/Statistics.vue'

const passthrough = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.())
    },
  })

const StatisticStub = defineComponent({
  inheritAttrs: false,
  props: ['suffix', 'title', 'value'],
  setup(props, { slots }) {
    return () =>
      h('div', [
        h('span', slots.title?.() ?? props.title),
        h('span', `${props.value ?? ''}${props.suffix ?? ''}`),
      ])
  },
})

describe('Statistics.vue', () => {
  beforeEach(() => {
    mockPauseBatch.mockReset()
    mockResetFilter.mockReset()
    mockResumeBatch.mockReset()
    mockStartBatch.mockReset()
    mockUpdateStatistics.mockReset()
  })

  it('renders ai usage metrics and refreshes statistics on mount', async () => {
    const wrapper = mount(Statistics, {
      global: {
        stubs: {
          Alert: true,
          ElButton: passthrough('button'),
          ElButtonGroup: passthrough('div'),
          ElCol: passthrough('div'),
          ElDropdown: passthrough('div'),
          ElDropdownItem: passthrough('div'),
          ElDropdownMenu: passthrough('div'),
          ElIcon: passthrough('span'),
          ElProgress: passthrough('div'),
          ElRow: passthrough('div'),
          ElStatistic: StatisticStub,
        },
      },
    })

    await flushPromises()

    expect(mockUpdateStatistics).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('AI调用：4次')
    expect(wrapper.text()).toContain('Token总量：12000tok')
    expect(wrapper.text()).toContain('估算费用：0.123456')
  })
})
