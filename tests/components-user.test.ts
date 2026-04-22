import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('User.vue', () => {
  it('uses the namespaced Element Plus selectors for dialog and table overrides', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/conf/User.vue'), 'utf8')

    expect(source).toContain('.ehp-dialog')
    expect(source).toContain('.ehp-dialog__header')
    expect(source).toContain('.ehp-table')
    expect(source).not.toContain('.el-dialog__header')
    expect(source).not.toContain('.el-table th.el-table__cell')
  })
})
