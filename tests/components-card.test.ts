// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createJob } from './helpers/jobs'

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
    mockDeliver.currentData = undefined
    mockJobList.list = [createJob()]
  })

  it('uses WheelEvent deltaX for horizontal scrolling when wheelDelta is unavailable', () => {
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

    state.scroll(new WheelEvent('wheel', { deltaX: 36, deltaY: 0 }))

    expect(grid.scrollLeft).toBe(36)
    expect(unwrap(state.autoScroll)).toBe(false)
  })
})
