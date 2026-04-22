import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('pages/zhipin index styles', () => {
  it('keeps index.scss as an import-only entrypoint for host and plugin layers', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/zhipin/index.scss'), 'utf8')

    expect(source).toContain("@use './styles/host-base.scss';")
    expect(source).toContain("@use './styles/host-job.scss';")
    expect(source).toContain("@use './styles/host-job-recommend.scss';")
    expect(source).toContain("@use './styles/host-jobs.scss';")
    expect(source).toContain("@use './styles/plugin-shell.scss';")
    expect(source).not.toContain('#wrap {')
    expect(source).not.toContain('.page-jobs#wrap {')
  })
})
