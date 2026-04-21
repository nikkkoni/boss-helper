// @vitest-environment jsdom

import { defineComponent, h, type VNode, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { LogStateName } from '@/stores/log'

const stubComponent = (name: string) =>
  defineComponent({
    name,
    props: ['onClick'],
    setup(props, { slots }) {
      return () => h(name, { ...props }, slots.default?.())
    },
  })

vi.mock('element-plus', () => ({
  ElButton: stubComponent('ElButton'),
  ElCheckbox: stubComponent('ElCheckbox'),
  ElCheckboxGroup: stubComponent('ElCheckboxGroup'),
  ElIcon: stubComponent('ElIcon'),
  ElPopover: defineComponent({
    name: 'ElPopover',
    setup(props, { slots }) {
      return () => h('ElPopover', { ...props }, [slots.default?.(), slots.reference?.()])
    },
  }),
  ElTag: stubComponent('ElTag'),
}))

import { createLogColumns } from '@/stores/logColumns'

function findVNodeByType(node: VNode | null | undefined, type: string): VNode | undefined {
  if (!node) return undefined
  if (node.type === type) return node

  const children = Array.isArray(node.children) ? node.children : []
  for (const child of children) {
    const found = findVNodeByType(child as VNode, type)
    if (found) return found
  }

  return undefined
}

describe('createLogColumns', () => {
  it('opens the detail dialog when clicking the title cell', () => {
    const dialogData = ref({ show: false, data: undefined })
    const filterStatus = ref<string[]>([])
    const stateNames: readonly LogStateName[] = [
      ['warning', '待处理'],
      ['success', '成功'],
    ]
    const [titleColumn] = createLogColumns({ dialogData, filterStatus, stateNames })
    const rowData = { title: 'Job Title' } as never

    const vnode = titleColumn.cellRenderer!({ rowData } as never)
    vnode.props?.onClick?.()

    expect(dialogData.value.show).toBe(true)
    expect(dialogData.value.data).toBe(rowData)
  })

  it('inverts the filter selection from the header popover', () => {
    const dialogData = ref({ show: false, data: undefined })
    const filterStatus = ref<string[]>(['待处理'])
    const stateNames: readonly LogStateName[] = [
      ['warning', '待处理'],
      ['success', '成功'],
    ]
    const [, stateColumn] = createLogColumns({ dialogData, filterStatus, stateNames })

    const headerVNode = stateColumn.headerCellRenderer!({ column: { title: '状态' } } as never)
    const toggleButton = findVNodeByType(headerVNode, 'ElButton')
    expect(toggleButton?.props?.onClick).toBeTypeOf('function')
    toggleButton?.props?.onClick?.()

    expect(filterStatus.value).toEqual(['成功'])
  })
})
