// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createJob } from './helpers/jobs'
import { __resetMessageMock } from './mocks/message'

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
})
