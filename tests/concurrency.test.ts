import { describe, expect, it, vi } from 'vitest'

import { createTaskBatcher } from '@/utils/concurrency'

describe('createTaskBatcher', () => {
  it('reuses cached falsy results within the ttl window', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const batcher = createTaskBatcher(1_000)
    const task = vi.fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(9)

    await expect(batcher.run('zero', task)).resolves.toBe(0)
    await expect(batcher.run('zero', task)).resolves.toBe(0)

    await expect(batcher.run('false', task)).resolves.toBe(false)
    await expect(batcher.run('false', task)).resolves.toBe(false)

    await expect(batcher.run('empty', task)).resolves.toBe('')
    await expect(batcher.run('empty', task)).resolves.toBe('')

    now += 2_000
    await expect(batcher.run('zero', task)).resolves.toBe(9)

    expect(task).toHaveBeenCalledTimes(4)
  })
})
