import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('App.vue', () => {
  it('removes reward and remote version info from the app shell', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(source).not.toContain('reward.png')
    expect(source).not.toContain('版本信息')
    expect(source).not.toContain('最新版本:')
    expect(source).not.toContain('更新内容：')
  })

  it('keeps current-repo links in the protocol notice', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(source).toContain('https://github.com/nikkkoni/boss-helper')
    expect(source).toContain('https://github.com/nikkkoni/boss-helper/issues')
  })
})
