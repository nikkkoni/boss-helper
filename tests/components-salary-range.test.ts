// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

import SalaryRange from '@/components/form/SalaryRange.vue'

const InputNumberStub = defineComponent({
  inheritAttrs: false,
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('button', {
        ...attrs,
        onClick: () => emit('update:modelValue', Number(props.modelValue ?? 0) + 1),
      })
  },
})

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})

describe('SalaryRange.vue', () => {
  it('emits new range tuples instead of mutating the input prop', async () => {
    const value: [number, number, boolean] = [10, 20, false]
    const wrapper = mount(SalaryRange, {
      props: {
        show: true,
        unit: 'K',
        value,
      },
      global: {
        stubs: {
          ElButton: ButtonStub,
          ElInputNumber: InputNumberStub,
        },
      },
    })

    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')

    expect(value).toEqual([10, 20, false])
    expect(wrapper.emitted('update:value')).toEqual([
      [[11, 20, false]],
      [[10, 21, false]],
      [[10, 20, true]],
    ])
  })
})
