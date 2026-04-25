// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

const { mockConf, mockFormInfoData } = vi.hoisted(() => {
  const keywordField = () => ({
    enable: false,
    include: true,
    options: [],
    value: [],
  })
  const fieldInfo = (label: string) => ({
    'data-help': `${label} help`,
    label,
  })

  return {
    mockConf: {
      applyTemplate: vi.fn(async () => {}),
      confDelete: vi.fn(),
      confExport: vi.fn(),
      confImport: vi.fn(),
      confRecommend: vi.fn(),
      confReload: vi.fn(),
      confSaving: vi.fn(),
      config_level: {
        advanced: true,
        expert: true,
        intermediate: true,
      },
      deleteTemplate: vi.fn(async () => {}),
      formData: {
        activityFilter: { value: true },
        aiFiltering: {
          enable: false,
          model: '',
        },
        company: keywordField(),
        companySizeRange: {
          enable: false,
          value: [0, 1000],
        },
        config_level: 'advanced',
        customGreeting: {
          enable: false,
          value: '',
        },
        delay: {
          deliveryInterval: 5,
          deliveryIntervalRandomOffset: 1,
        },
        deliveryLimit: { value: 120 },
        friendStatus: { value: true },
        goldHunterFilter: { value: false },
        greetingVariable: { value: false },
        hrPosition: keywordField(),
        jobAddress: keywordField(),
        jobContent: keywordField(),
        jobTitle: keywordField(),
        notification: { value: true },
        salaryRange: {
          advancedValue: {
            D: [500, 1000],
            H: [60, 120],
            M: [10000, 30000],
          },
          enable: false,
          value: [10, 30],
        },
        sameCompanyFilter: { value: true },
        sameHrFilter: { value: true },
        useCache: { value: true },
      },
      saveTemplate: vi.fn(async () => {}),
      templateNames: ['默认模板'],
    },
    mockFormInfoData: {
      activityFilter: fieldInfo('活跃度过滤'),
      company: fieldInfo('公司'),
      companySizeRange: fieldInfo('公司规模'),
      config_level: {
        'data-help': '配置级别 help',
        options: [
          { label: '初级', value: 'beginner' },
          { label: '高级', value: 'advanced' },
        ],
      },
      customGreeting: fieldInfo('自定义招呼语'),
      delay: {
        deliveryInterval: { ...fieldInfo('投递间隔'), min: 1 },
        deliveryIntervalRandomOffset: { ...fieldInfo('随机偏移'), min: 0 },
      },
      deliveryLimit: fieldInfo('每日上限'),
      friendStatus: fieldInfo('沟通过滤'),
      goldHunterFilter: fieldInfo('猎头过滤'),
      greetingVariable: fieldInfo('招呼语变量'),
      hrPosition: fieldInfo('HR 职位'),
      jobAddress: fieldInfo('工作地点'),
      jobContent: fieldInfo('职位内容'),
      jobTitle: fieldInfo('岗位名称'),
      notification: fieldInfo('通知'),
      salaryRange: fieldInfo('薪资范围'),
      sameCompanyFilter: fieldInfo('同公司过滤'),
      sameHrFilter: fieldInfo('同 HR 过滤'),
      useCache: fieldInfo('使用缓存'),
    },
  }
})

vi.mock('@/components/Alert', () => ({
  default: defineComponent({
    props: ['description', 'title'],
    setup(props) {
      return () => h('div', [props.title, props.description])
    },
  }),
}))

vi.mock('@/components/form/FormItem.vue', () => ({
  default: defineComponent({
    props: ['label'],
    setup(props, { slots }) {
      return () =>
        h('div', { 'data-test': `form-item-${props.label}` }, [
          h('span', props.label),
          slots.include?.(),
          slots.default?.(),
        ])
    },
  }),
}))

vi.mock('@/components/form/FormSelect.vue', () => ({
  default: defineComponent({
    setup() {
      return () => h('div', 'select')
    },
  }),
}))

vi.mock('@/components/form/SalaryRange.vue', () => ({
  default: defineComponent({
    setup() {
      return () => h('div', 'range')
    },
  }),
}))

vi.mock('@/stores/common', () => ({
  useCommon: () => ({
    deliverLock: false,
  }),
}))

vi.mock('@/stores/conf', () => ({
  formInfoData: mockFormInfoData,
  useConf: () => mockConf,
}))

vi.mock('@/composables/useApplying', () => ({
  getCacheManager: () => ({
    clearCache: vi.fn(),
  }),
}))

const passthrough = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    props: ['label', 'modelValue', 'title'],
    emits: ['update:modelValue'],
    setup(props, { attrs, slots }) {
      return () =>
        h(tag, attrs, slots.default?.() ?? slots.reference?.() ?? props.label ?? props.title)
    },
  })

import Config from '@/pages/zhipin/components/Config.vue'

describe('Config.vue compact layout', () => {
  it('shows setup and filtering by default while keeping maintenance folded', () => {
    const wrapper = mount(Config, {
      global: {
        stubs: {
          Ai: {
            template: '<div data-test="ai-stub">AI 管理</div>',
          },
          ElAlert: passthrough('div'),
          ElButton: passthrough('button'),
          ElCheckbox: passthrough('label'),
          ElForm: passthrough('form'),
          ElFormItem: passthrough('label'),
          ElInput: passthrough('textarea'),
          ElInputNumber: passthrough('input'),
          ElLink: passthrough('a'),
          ElOption: passthrough('option'),
          ElPopover: passthrough('div'),
          ElSelect: passthrough('select'),
        },
      },
    })

    expect(wrapper.find('[data-test="config-basic-section"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="config-rules-section"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="config-ai-section"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="config-basic-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="config-template-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="config-maintenance-panel"]').exists()).toBe(true)

    expect(wrapper.text()).toContain('基础设置')
    expect(wrapper.text()).toContain('筛选规则')
    expect(wrapper.text()).toContain('展示与上限')
    expect(wrapper.text()).toContain('配置模板')
    expect(wrapper.text()).toContain('关键词与岗位条件')
    expect(wrapper.text()).toContain('公司')

    expect(wrapper.get('[aria-label="收起关键词与岗位条件"]').attributes('aria-expanded')).toBe(
      'true',
    )
    expect(wrapper.get('[aria-label="展开维护操作"]').attributes('aria-expanded')).toBe('false')
  })
})
