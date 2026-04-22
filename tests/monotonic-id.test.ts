import { describe, expect, it, vi } from 'vitest'

import { createMonotonicIdGenerator } from '@/utils/monotonicId'

describe('createMonotonicIdGenerator', () => {
  it('returns increasing ids and bumps when the seed goes backwards', () => {
    const nextId = createMonotonicIdGenerator()

    expect(nextId(5)).toBe(5)
    expect(nextId(6)).toBe(6)
    expect(nextId(3)).toBe(7)
    expect(nextId(10)).toBe(10)
  })

  it('falls back to Date.now when the seed is not finite', () => {
    const nextId = createMonotonicIdGenerator()
    const nowSpy = vi.spyOn(Date, 'now')

    nowSpy.mockReturnValueOnce(1_000)
    expect(nextId(Number.NaN)).toBe(1_000)

    nowSpy.mockReturnValueOnce(2_000)
    expect(nextId(Number.POSITIVE_INFINITY)).toBe(2_000)

    nowSpy.mockRestore()
  })
})
