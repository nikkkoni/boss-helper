import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('FormSelect integration', () => {
  it('treats options as a readonly prop instead of a second v-model channel', () => {
    const formSelectSource = readFileSync(
      resolve(process.cwd(), 'src/components/form/FormSelect.vue'),
      'utf8',
    )
    const configSource = readFileSync(
      resolve(process.cwd(), 'src/pages/zhipin/components/Config.vue'),
      'utf8',
    )

    expect(formSelectSource).toContain("const value = defineModel<string[]>('value', { required: true })")
    expect(formSelectSource).toContain('defineProps<{\n  options: string[]\n}>()')
    expect(formSelectSource).not.toContain("defineModel<string[]>('options'")

    expect(configSource).toContain(':options="conf.formData.company.options"')
    expect(configSource).toContain(':options="conf.formData.jobTitle.options"')
    expect(configSource).toContain(':options="conf.formData.jobContent.options"')
    expect(configSource).toContain(':options="conf.formData.hrPosition.options"')
    expect(configSource).toContain(':options="conf.formData.jobAddress.options"')
    expect(configSource).not.toContain('v-model:options=')
  })
})
