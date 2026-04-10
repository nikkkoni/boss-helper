// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import deepmerge, { isPlainObject, jsonClone } from '@/utils/deepmerge'
import { parseGptJson } from '@/utils/parse'

describe('parseGptJson', () => {
  it('parses fenced json blocks', () => {
    expect(
      parseGptJson<{ answer: string }>('prefix```json\n{"answer":"ok"}\n```suffix'),
    ).toEqual({ answer: 'ok' })
  })

  it('parses partial json responses', () => {
    expect(parseGptJson<{ answer: string; score: number }>('{"answer":"ok","score":9')).toEqual({
      answer: 'ok',
      score: 9,
    })
  })
})

describe('deepmerge helpers', () => {
  it('recognizes plain objects and rejects arrays or tagged objects', () => {
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject(Object.create(null))).toBe(true)
    expect(isPlainObject(['a'])).toBe(false)
    expect(
      isPlainObject({
        [Symbol.toStringTag]: 'tagged',
      }),
    ).toBe(false)
  })

  it('merges nested plain objects and ignores __proto__ pollution', () => {
    const target = {
      nested: {
        left: 1,
      },
      stable: true,
    }

    const source = JSON.parse('{"__proto__":{"polluted":true},"nested":{"right":2}}')

    const result = deepmerge(target, source)

    expect(result).toEqual({
      nested: {
        left: 1,
        right: 2,
      },
      stable: true,
    })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(result).not.toBe(target)
  })

  it('clones arrays instead of reusing source references', () => {
    const source = {
      nested: {
        list: [{ value: 1 }],
      },
    }

    const result = deepmerge({}, source)
    ;(result as { nested: { list: Array<{ value: number }> } }).nested.list[0].value = 2

    expect(source.nested.list[0].value).toBe(1)
  })

  it('ignores constructor pollution payloads', () => {
    const result = deepmerge(
      { nested: { safe: true } },
      JSON.parse('{"constructor":{"prototype":{"polluted":true}},"nested":{"next":1}}'),
    )

    expect(result).toEqual({
      nested: {
        next: 1,
        safe: true,
      },
    })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('supports in-place merging when clone is false', () => {
    const target = {
      nested: {
        value: 1,
      },
    }

    const result = deepmerge(target, { nested: { value: 2, next: 3 } }, { clone: false })

    expect(result).toBe(target)
    expect(target).toEqual({
      nested: {
        next: 3,
        value: 2,
      },
    })
  })

  it('jsonClone returns a detached copy', () => {
    const source = {
      nested: {
        value: 1,
      },
    }
    const cloned = jsonClone(source)

    cloned.nested.value = 2

    expect(source.nested.value).toBe(1)
    expect(cloned).toEqual({
      nested: {
        value: 2,
      },
    })
  })
})
