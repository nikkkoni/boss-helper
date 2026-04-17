// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'

import { setupPinia } from './helpers/pinia'

const {
  mockElMessageError,
  mockElMessageWarning,
  mockConf,
  mockGetModel,
  mockGetUserResumeString,
  mockJobList,
  mockModelStore,
  mockParseFiltering,
} = vi.hoisted(() => ({
  mockConf: {
    confSaving: vi.fn(async () => {}),
    formData: {
      aiFiltering: {
        model: '',
        prompt: '',
        score: 10,
      },
    },
  },
  mockElMessageError: vi.fn(),
  mockElMessageWarning: vi.fn(),
  mockGetModel: vi.fn(),
  mockGetUserResumeString: vi.fn(async () => 'resume'),
  mockJobList: {
    list: [] as Array<Record<string, unknown>>,
  },
  mockModelStore: {
    getModel: vi.fn(),
    modelData: [] as Array<{ key: string; name: string }>,
  },
  mockParseFiltering: vi.fn((content: string) => ({ message: content })),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: {
      error: mockElMessageError,
      warning: mockElMessageWarning,
    },
    ElMessageBox: vi.fn(async () => true),
  }
})

vi.mock('@/components/Jobcard.vue', () => ({
  default: { name: 'JobCard', template: '<div />' },
}))

vi.mock('@/components/SafeHtml.vue', () => ({
  default: { name: 'SafeHtml', template: '<span />' },
}))

vi.mock('@/components/Alert', () => ({
  default: { name: 'Alert', template: '<div><slot /></div>' },
}))

vi.mock('@/composables/useApplying/utils', () => ({
  parseFiltering: mockParseFiltering,
}))

mockModelStore.getModel = mockGetModel

vi.mock('@/composables/useModel', () => ({
  useModel: () => mockModelStore,
}))

vi.mock('@/stores/conf', () => ({
  formInfoData: {
    aiFiltering: {
      example: ['', [{ content: '', role: 'user' }]],
      label: 'AI过滤',
    },
  },
  useConf: () => mockConf,
}))

vi.mock('@/stores/jobs', () => ({
  jobList: mockJobList,
}))

vi.mock('@/stores/user', () => ({
  useUser: () => ({
    getUserResumeString: mockGetUserResumeString,
  }),
}))

import SelectllmTestDialog from '@/components/llms/selectllm/SelectllmTestDialog.vue'

describe('Selectllm.vue', () => {
  beforeEach(() => {
    setupPinia()
    mockElMessageError.mockReset()
    mockElMessageWarning.mockReset()
    mockGetModel.mockReset()
    mockGetUserResumeString.mockClear()
    mockParseFiltering.mockClear()
    mockConf.confSaving.mockClear()
    mockConf.formData.aiFiltering.model = ''
    mockConf.formData.aiFiltering.prompt = ''
    mockConf.formData.aiFiltering.score = 10
    mockModelStore.modelData = []
    mockJobList.list = []
  })

  it('resets test loading state when model validation fails early', async () => {
    const wrapper = mount(SelectllmTestDialog, {
      props: {
        data: 'aiFiltering',
        modelValue: true,
        state: {
          currentModel: ref(''),
          message: ref(''),
          singleMode: ref(true),
        },
      },
    })

    const state = wrapper.vm as unknown as {
      testJob: () => Promise<void>
      testJobLoading: { value: boolean } | boolean
      testJobStop: { value: boolean } | boolean
    }
    const unwrap = <T,>(value: { value: T } | T): T =>
      value != null && typeof value === 'object' && 'value' in value ? value.value : value

    await state.testJob()

    expect(mockElMessageWarning).toHaveBeenCalledWith('请在上级弹窗右上角选择模型')
    expect(unwrap(state.testJobLoading)).toBe(false)
    expect(unwrap(state.testJobStop)).toBe(true)
  })

  it('renders multi-turn form mode without binding v-model to ElForm', () => {
    const source = readFileSync(
      '/Users/wang/Documents/boss/boss-helper/src/components/llms/selectllm/SelectllmPromptEditor.vue',
      'utf8',
    )

    expect(source).toContain('<ElForm v-else label-width="auto" class="demo-dynamic">')
    expect(source).not.toContain('<ElForm v-else v-model="message as string"')
  })

  it('uses the current repository variable table link instead of the upstream fork', () => {
    const source = readFileSync(
      '/Users/wang/Documents/boss/boss-helper/src/components/llms/selectllm/SelectllmPromptEditor.vue',
      'utf8',
    )

    expect(source).toContain('https://github.com/nikkkoni/boss-helper/blob/main/src/types/bossData.d.ts')
    expect(source).not.toContain('https://github.com/Ocyss/boos-helper')
  })
})
