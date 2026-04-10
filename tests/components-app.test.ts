import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('App.vue', () => {
  it('keeps the protocol reward image width, height and object-fit in a single style attribute', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(source).toContain(
      '<img style="width: 200px; height: 200px; object-fit: cover;" src="https://qiu-config.oss-cn-beijing.aliyuncs.com/reward.png"/>',
    )
    expect(source).not.toContain(
      '<img style="width: 200px; height: 200px;" src="https://qiu-config.oss-cn-beijing.aliyuncs.com/reward.png" style="object-fit: cover;"/>',
    )
  })
})
