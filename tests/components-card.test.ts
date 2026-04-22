// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetAppearanceConfigStateForTests } from '@/pages/zhipin/hooks/useAppearanceConfig'

import { createJob } from './helpers/jobs'
import { __resetMessageMock, __setStorageItem } from './mocks/message'

const { mockDeliver, mockJobList } = vi.hoisted(() => ({
  mockDeliver: {
    currentData: undefined as { encryptJobId: string } | undefined,
  },
  mockJobList: {
    list: [] as ReturnType<typeof createJob>[],
  },
}))

vi.mock('@/components/Jobcard.vue', () => ({
  default: {
    name: 'JobCard',
    props: ['job'],
    template: '<div class="job-card-stub" />',
  },
}))

vi.mock('@/stores/jobs', () => ({
  jobList: mockJobList,
}))

vi.mock('@/pages/zhipin/hooks/useDeliver', () => ({
  useDeliver: () => mockDeliver,
}))

import Card from '@/pages/zhipin/components/Card.vue'

describe('Card.vue', () => {
  beforeEach(() => {
    __resetMessageMock()
    __resetAppearanceConfigStateForTests()
    mockDeliver.currentData = undefined
    mockJobList.list = [createJob()]
  })

  it('maps vertical wheel input to horizontal board scrolling', () => {
    const wrapper = mount(Card, {
      global: {
        stubs: {
          ElSwitch: true,
        },
      },
    })

    const grid = wrapper.get('.card-grid').element as HTMLDivElement
    grid.scrollLeft = 0

    const state = ((wrapper.vm.$ as unknown) as { setupState: unknown }).setupState as {
      autoScroll: { value: boolean } | boolean
      scroll: (event: WheelEvent) => void
    }
    const unwrap = <T,>(value: { value: T } | T): T =>
      value != null && typeof value === 'object' && 'value' in value ? value.value : value

    state.scroll(new WheelEvent('wheel', { deltaX: 0, deltaY: 72 }))

    expect(grid.scrollLeft).toBe(36)
    expect(unwrap(state.autoScroll)).toBe(false)
  })

  it('moves the candidate board with nav buttons', async () => {
    const wrapper = mount(Card, {
      global: {
        stubs: {
          ElSwitch: true,
        },
      },
    })

    const grid = wrapper.get('.card-grid').element as HTMLDivElement
    grid.scrollLeft = 0
    Object.defineProperty(grid, 'clientWidth', {
      value: 400,
      configurable: true,
    })
    const scrollByMock = vi.fn(({ left }: { left: number; behavior: ScrollBehavior }) => {
      grid.scrollLeft += left
    })
    grid.scrollBy = scrollByMock as unknown as typeof grid.scrollBy

    await wrapper.get('.boss-helper-card__nav--next').trigger('click')

    expect(scrollByMock).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' })
    expect(grid.scrollLeft).toBe(300)
  })

  it('enables blur overlay from persisted appearance config and updates spotlight position', async () => {
    __setStorageItem('appearance-conf', {
      blurCard: true,
      changeBackground: false,
      changeIcon: false,
      dynamicTitle: false,
      hideHeader: false,
      listSink: false,
    })

    const wrapper = mount(Card, {
      attachTo: document.body,
      global: {
        stubs: {
          ElSwitch: true,
        },
      },
    })

    const board = wrapper.get('.boss-helper-card').element as HTMLDivElement
    Object.defineProperty(board, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 260,
        height: 240,
        left: 20,
        right: 420,
        top: 40,
        width: 400,
        x: 20,
        y: 40,
        toJSON: () => ({}),
      }),
    })

    await flushPromises()
    await wrapper.trigger('mousemove', { clientX: 120, clientY: 140 })
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

    expect(wrapper.classes()).toContain('boss-helper-card--blur-enabled')
    expect(board.style.getPropertyValue('--x')).toBe('100px')
    expect(board.style.getPropertyValue('--y')).toBe('100px')
    expect(board.style.getPropertyValue('--r')).toBe('130px')

    await wrapper.trigger('mouseleave')

    expect(board.style.getPropertyValue('--r')).toBe('0px')
  })
})
