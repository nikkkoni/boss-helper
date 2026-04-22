// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const counterMock = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}))

vi.mock('element-plus', () => ({
  alertProps: {},
  ElAlert: defineComponent({
    name: 'ElAlert',
    props: ['onClose'],
    setup(props, { slots }) {
      return () =>
        h(
          'div',
          {
            class: 'el-alert',
            onClick: () => props.onClose?.(),
          },
          slots.default?.(),
        )
    },
  }),
}))

vi.mock('@/message', () => ({
  counter: counterMock,
}))

import Alert from '@/components/Alert'

describe('Alert.vue', () => {
  beforeEach(() => {
    counterMock.storageGet.mockReset()
    counterMock.storageSet.mockReset()
  })

  it('hides when the alert was dismissed previously', async () => {
    counterMock.storageGet.mockResolvedValueOnce(true)

    const wrapper = mount(Alert, {
      props: { id: 'test-alert', title: 'warning' },
      slots: { default: () => 'content' },
    })

    await flushPromises()

    expect(counterMock.storageGet).toHaveBeenCalledWith('local:alert:test-alert', false)
    expect(wrapper.html()).toBe('')
  })

  it('persists dismissals and hides after closing', async () => {
    counterMock.storageGet.mockResolvedValueOnce(false)

    const wrapper = mount(Alert, {
      props: { id: 'close-alert', title: 'hello' },
      slots: { default: () => 'content' },
    })

    await flushPromises()
    expect(wrapper.find('.el-alert').exists()).toBe(true)

    await wrapper.find('.el-alert').trigger('click')
    await flushPromises()

    expect(counterMock.storageSet).toHaveBeenCalledWith('local:alert:close-alert', true)
    expect(wrapper.html()).toBe('')
  })
})
