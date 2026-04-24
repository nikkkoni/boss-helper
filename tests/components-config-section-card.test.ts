// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ConfigSectionCard from '@/pages/zhipin/components/config/ConfigSectionCard.vue'

describe('ConfigSectionCard.vue', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps collapsible cards folded by default and expands from the header', async () => {
    const wrapper = mount(ConfigSectionCard, {
      attachTo: document.body,
      props: {
        collapsible: true,
        defaultCollapsed: true,
        title: '基础设置',
      },
      slots: {
        default: '<div data-test="card-body">配置内容</div>',
      },
    })

    const header = wrapper.find('[role="button"]')

    expect(header.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-test="card-body"]').isVisible()).toBe(false)

    await header.trigger('click')

    expect(header.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[data-test="card-body"]').isVisible()).toBe(true)
  })

  it('toggles collapsible cards with the keyboard', async () => {
    const wrapper = mount(ConfigSectionCard, {
      attachTo: document.body,
      props: {
        collapsible: true,
        defaultCollapsed: true,
        title: '快捷操作',
      },
      slots: {
        default: '<div data-test="card-body">操作内容</div>',
      },
    })

    const header = wrapper.find('[role="button"]')

    await header.trigger('keydown', { key: 'Enter' })
    expect(header.attributes('aria-expanded')).toBe('true')

    await header.trigger('keydown', { key: ' ' })
    expect(header.attributes('aria-expanded')).toBe('false')
  })
})
