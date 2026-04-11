import { describe, expect, it, vi } from 'vitest'

import {
  type CircuitBreaker,
  CircuitBreakerError,
  createCircuitBreaker,
  type MinIntervalGate,
  createMinIntervalGate,
  retryAsync,
  runWithRecovery,
} from '@/utils/retry'

describe('retry utils', () => {
  it('retries with exponential backoff and retry context', async () => {
    const wait = vi.fn(async () => {})
    const onRetry = vi.fn()
    const operation = vi.fn(async (attempt: number) => {
      if (attempt < 3) {
        throw new Error(`fail-${attempt}`)
      }
      return 'ok'
    })

    await expect(
      retryAsync(operation, {
        baseDelayMs: 10,
        factor: 2,
        onRetry,
        retries: 2,
        wait,
      }),
    ).resolves.toBe('ok')

    expect(operation).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenNthCalledWith(1, 10)
    expect(wait).toHaveBeenNthCalledWith(2, 20)
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), {
      attempt: 1,
      delayMs: 10,
      nextAttempt: 2,
    })
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), {
      attempt: 2,
      delayMs: 20,
      nextAttempt: 3,
    })
  })

  it('opens the circuit after repeated failures and recovers after the open window', async () => {
    let now = 1_000
    const breaker = createCircuitBreaker({
      failureThreshold: 2,
      getNow: () => now,
      openMs: 1_000,
    })

    await expect(breaker.run(async () => Promise.reject(new Error('first')))).rejects.toThrow('first')
    await expect(breaker.run(async () => Promise.reject(new Error('second')))).rejects.toThrow('second')

    expect(breaker.state).toBe('open')
    expect(breaker.failureCount).toBe(2)

    await expect(breaker.run(async () => 'blocked')).rejects.toEqual(
      expect.objectContaining({
        name: 'CircuitBreakerError',
        retryAfterMs: 1_000,
      } satisfies Partial<CircuitBreakerError>),
    )

    now = 2_000
    await expect(breaker.run(async () => 'ok')).resolves.toBe('ok')
    expect(breaker.state).toBe('closed')
    expect(breaker.failureCount).toBe(0)
  })

  it('serializes runs through the min interval gate', async () => {
    let now = 0
    const wait = vi.fn(async (ms: number) => {
      now += ms
    })
    const gate = createMinIntervalGate(50, {
      getNow: () => now,
      wait,
    })
    const order: string[] = []

    const first = gate.run(async () => {
      order.push('first')
      return 1
    })
    const second = gate.run(async () => {
      order.push('second')
      return 2
    })

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
    expect(order).toEqual(['first', 'second'])
    expect(wait).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledWith(50)
    expect(gate.nextAvailableAt).toBe(100)
  })

  it('runs recovery through the provided gate and circuit breaker', async () => {
    const minIntervalGate: MinIntervalGate = {
      minIntervalMs: 10,
      nextAvailableAt: 0,
      run: async <T>(operation: () => Promise<T>) => operation(),
    }
    const circuitBreaker: CircuitBreaker = {
      failureCount: 0,
      openedUntil: 0,
      state: 'closed' as const,
      reset: vi.fn(),
      run: async <T>(operation: () => Promise<T>) => operation(),
    }
    const minIntervalGateRunSpy = vi.spyOn(minIntervalGate, 'run')
    const circuitBreakerRunSpy = vi.spyOn(circuitBreaker, 'run')
    const operation = vi.fn(async () => 'ok')

    await expect(
      runWithRecovery(operation, {
        circuitBreaker,
        minIntervalGate,
      }),
    ).resolves.toBe('ok')

    expect(circuitBreakerRunSpy).toHaveBeenCalledTimes(1)
    expect(minIntervalGateRunSpy).toHaveBeenCalledTimes(1)
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
