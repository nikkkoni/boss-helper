// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockGetModel = vi.fn()

vi.mock('@/composables/useModel', () => ({
  llms: [
    {
      advanced: { value: {} },
      api_key: { value: '' },
      mode: { label: 'OpenAI', mode: 'openai' },
      model: { value: 'gpt-4o-mini' },
      other: { value: {} },
      url: { value: 'https://api.example.com' },
    },
  ],
  useModel: () => ({
    getModel: mockGetModel,
  }),
}))

vi.mock('@/components/llms/LLMForm.vue', () => ({
  default: {
    name: 'LLMForm',
    props: ['data', 'modelValue'],
    template: '<div class="llm-form-stub" />',
  },
}))

import CreateLLM from '@/components/llms/CreateLLM.vue'

describe('CreateLLM.vue', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pads random rgb channels into a valid six-digit hex color', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(1 / 256)
      .mockReturnValueOnce(2 / 256)
      .mockReturnValueOnce(15 / 256)

    const wrapper = shallowMount(CreateLLM, {
      props: {
        modelValue: true,
      },
    })

    const state = ((wrapper.vm.$ as unknown) as { setupState: unknown }).setupState as {
      createColor: { value: string } | string
    }
    const unwrap = <T,>(value: { value: T } | T): T =>
      value != null && typeof value === 'object' && 'value' in value ? value.value : value

    expect(unwrap(state.createColor)).toBe('#01020f')
  })
})
