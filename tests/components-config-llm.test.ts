// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExportJson, mockImportJson } = vi.hoisted(() => ({
  mockExportJson: vi.fn(),
  mockImportJson: vi.fn(),
}))

vi.mock('@/utils/jsonImportExport', () => {
  class ImportJsonCancelledError extends Error {}

  return {
    ImportJsonCancelledError,
    exportJson: mockExportJson,
    importJson: mockImportJson,
  }
})

import ConfigLLM from '@/components/llms/ConfigLLM.vue'
import { useModel } from '@/composables/useModel'
import type { modelData } from '@/composables/useModel'

import { setupPinia } from './helpers/pinia'

function createModelItem(key: string, name: string): modelData {
  return {
    color: '#409eff',
    data: {
      advanced: {},
      api_key: 'secret',
      model: 'gpt-4o-mini',
      mode: 'openai' as const,
      other: {},
      url: 'https://api.example.com',
    },
    key,
    name,
  }
}

describe('ConfigLLM.vue', () => {
  beforeEach(() => {
    setupPinia()
    mockExportJson.mockReset()
    mockImportJson.mockReset()
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'mock-uuid'),
    })
  })

  it('copies and deletes model entries through component actions', async () => {
    const store = useModel()
    store.modelData = [createModelItem('one', 'Primary')]

    const wrapper = shallowMount(ConfigLLM, {
      props: {
        modelValue: true,
      },
    })

    const state = ((wrapper.vm.$ as unknown) as { setupState: unknown }).setupState as {
      copy: (data: ReturnType<typeof createModelItem>) => void
      del: (data: ReturnType<typeof createModelItem>) => void
    }

    state.copy(store.modelData[0] as ReturnType<typeof createModelItem>)
    expect(store.modelData).toHaveLength(2)
    expect(store.modelData[1].key).toBe('mock-uuid')
    expect(store.modelData[1].name).toBe('Primary 副本')

    state.del(store.modelData[0] as ReturnType<typeof createModelItem>)
    expect(store.modelData).toHaveLength(1)
    expect(store.modelData[0].name).toBe('Primary 副本')
  })

  it('imports, exports and closes using model store actions', async () => {
    const store = useModel()
    store.modelData = [createModelItem('one', 'Primary')]
    const initSpy = vi.spyOn(store, 'initModel').mockResolvedValue(undefined)

    mockImportJson.mockResolvedValueOnce([createModelItem('two', 'Imported')])

    const wrapper = shallowMount(ConfigLLM, {
      props: {
        modelValue: true,
      },
    })

    const state = ((wrapper.vm.$ as unknown) as { setupState: unknown }).setupState as {
      close: () => void
      exportllm: () => void
      importllm: () => Promise<void>
    }

    await state.importllm()
    expect(store.modelData).toEqual([expect.objectContaining({ key: 'two', name: 'Imported' })])

    state.exportllm()
    expect(mockExportJson).toHaveBeenCalledWith(
      [expect.objectContaining({ key: 'two', name: 'Imported' })],
      'Ai模型配置',
    )

    state.close()
    expect(initSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('creates a new model or updates an existing one', () => {
    const store = useModel()
    store.modelData = [createModelItem('one', 'Primary')]

    const wrapper = shallowMount(ConfigLLM, {
      props: {
        modelValue: true,
      },
    })

    const state = ((wrapper.vm.$ as unknown) as { setupState: unknown }).setupState as {
      create: (data: ReturnType<typeof createModelItem>) => void
    }

    state.create({
      ...createModelItem('one', 'Updated'),
      color: '#67c23a',
    })
    expect(store.modelData[0]).toEqual(expect.objectContaining({ color: '#67c23a', name: 'Updated' }))

    state.create({
      ...createModelItem('', 'New Item'),
    })
    expect(store.modelData).toHaveLength(2)
    expect(store.modelData[1].key).toBe('mock-uuid')
    expect(store.modelData[1].name).toBe('New Item')
  })

  it('opens edit mode and resets draft state for new models', () => {
    const store = useModel()
    store.modelData = [createModelItem('one', 'Primary')]

    const wrapper = shallowMount(ConfigLLM, {
      props: {
        modelValue: true,
      },
    })

    const state = ((wrapper.vm.$ as unknown) as { setupState: unknown }).setupState as {
      createBoxShow: { value: boolean } | boolean
      createModelData: { value: ReturnType<typeof createModelItem> | undefined } | ReturnType<typeof createModelItem> | undefined
      edit: (data: ReturnType<typeof createModelItem>) => void
      newllm: () => void
    }
    const unwrap = <T,>(value: { value: T } | T): T =>
      value != null && typeof value === 'object' && 'value' in value ? value.value : value

    state.edit(store.modelData[0] as ReturnType<typeof createModelItem>)
    expect(unwrap(state.createBoxShow)).toBe(true)
    expect(unwrap(state.createModelData)).toEqual(expect.objectContaining({ key: 'one', name: 'Primary' }))

    state.newllm()
    expect(unwrap(state.createBoxShow)).toBe(true)
    expect(unwrap(state.createModelData)).toBeUndefined()
  })
})
