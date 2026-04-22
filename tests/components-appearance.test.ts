import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Appearance.vue', () => {
  it('delegates DOM side effects to the shared appearance effects hook', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/zhipin/components/Appearance.vue'),
      'utf8',
    )

    expect(source).not.toContain("document.getElementById('header')")
    expect(source).not.toContain("document.getElementById('boss-helper-job-wrap')")
    expect(source).not.toContain('useFavicon')
    expect(source).not.toContain('useTitle')
    expect(source).toContain('useAppearanceConfig')
  })
})
