import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useAgentRuntime } from '@/stores/agent'

describe('useAgentRuntime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('tracks target job ids and removes seen jobs from remaining queue', () => {
    const store = useAgentRuntime()

    store.setTargetJobIds(['job-1', 'job-2', 'job-3'])

    expect(store.activeTargetJobIds).toEqual(['job-1', 'job-2', 'job-3'])
    expect(store.remainingTargetJobIds).toEqual(['job-1', 'job-2', 'job-3'])

    const remainingCount = store.consumeSeenJobIds(['job-2', 'job-4'])

    expect(remainingCount).toBe(2)
    expect(store.remainingTargetJobIds).toEqual(['job-1', 'job-3'])
    expect(store.activeTargetJobIds).toEqual(['job-1', 'job-2', 'job-3'])
  })

  it('tracks batch lifecycle flags and clears state', () => {
    const store = useAgentRuntime()
    const pendingBatch = Promise.resolve()

    expect(store.hasPendingBatch).toBe(false)

    store.setBatchPromise(pendingBatch)
    store.setStopRequestedByCommand(true)
    store.setTargetJobIds(['job-1'])

    expect(store.batchPromise).toBe(pendingBatch)
    expect(store.hasPendingBatch).toBe(true)
    expect(store.stopRequestedByCommand).toBe(true)

    store.clearTargetJobState()
    store.setBatchPromise(null)
    store.setStopRequestedByCommand(false)

    expect(store.activeTargetJobIds).toEqual([])
    expect(store.remainingTargetJobIds).toEqual([])
    expect(store.batchPromise).toBeNull()
    expect(store.hasPendingBatch).toBe(false)
    expect(store.stopRequestedByCommand).toBe(false)
  })
})