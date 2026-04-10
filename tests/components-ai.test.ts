import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Ai.vue', () => {
  it('uses Vue key binding syntax for the dynamic Selectllm dialog', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/zhipin/components/Ai.vue'),
      'utf8',
    )

    expect(source).toContain(':key="aiBox"')
    expect(source).not.toContain('v-key="aiBox"')
  })
})
