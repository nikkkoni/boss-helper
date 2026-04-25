// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createJob } from './helpers/jobs'
import { __resetMessageMock } from './mocks/message'

const { mockDeliver, mockJobList } = vi.hoisted(() => ({
  mockDeliver: {
    currentData: undefined as
      | { encryptJobId: string; jobName?: string; status?: { msg?: string } }
      | undefined,
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

  it('merges run status and quick actions into the candidate board', async () => {
    mockDeliver.currentData = {
      encryptJobId: mockJobList.list[0].encryptJobId,
      jobName: '前端工程师',
      status: { msg: 'AI 过滤通过' },
    }

    const wrapper = mount(Card, {
      props: {
        deliveryStateLabel: '运行中',
        deliveryStateTone: 'running',
        deliveryStatusMessage: '正在处理当前岗位',
        pageProgressLabel: '1/3',
        primaryActionLabel: '继续投递',
        resetVisible: true,
        routeLabel: '/web/geek/jobs',
        searchPanelLabel: '新版 jobs 搜索桥接',
        showPauseAction: true,
        totalJobsLabel: '3 个岗位',
      },
      global: {
        stubs: {
          ElSwitch: true,
        },
      },
    })

    expect(wrapper.text()).toContain('候选岗位面板')
    expect(wrapper.text()).toContain('运行状态')
    expect(wrapper.text()).toContain('运行中')
    expect(wrapper.text()).toContain('正在处理当前岗位')
    expect(wrapper.text()).toContain('前端工程师')
    expect(wrapper.text()).toContain('1/3')
    expect(wrapper.text()).toContain('/web/geek/jobs')
    expect(wrapper.text()).toContain('新版 jobs 搜索桥接')

    const actionButtons = wrapper.findAll('.boss-helper-card__action')
    await actionButtons.find((button) => button.text() === '继续投递')?.trigger('click')
    await actionButtons.find((button) => button.text() === '暂停投递')?.trigger('click')
    await actionButtons.find((button) => button.text() === '重置筛选')?.trigger('click')
    await actionButtons.find((button) => button.text() === '打开筛选区')?.trigger('click')
    await actionButtons.find((button) => button.text() === '调整配置')?.trigger('click')
    await actionButtons.find((button) => button.text() === '查看日志')?.trigger('click')

    expect(wrapper.emitted('primary-action')).toHaveLength(1)
    expect(wrapper.emitted('pause-action')).toHaveLength(1)
    expect(wrapper.emitted('reset-action')).toHaveLength(1)
    expect(wrapper.emitted('open-tab')).toEqual([['filter'], ['config'], ['logs']])
  })
})
