import { computed, shallowRef, ref } from 'vue'
import { defineStore } from 'pinia'

export const useAgentRuntime = defineStore('zhipin/agent-runtime', () => {
  const batchPromise = shallowRef<Promise<void> | null>(null)
  const activeTargetJobIds = ref<string[]>([])
  const remainingTargetJobIds = ref<string[]>([])
  const stopRequestedByCommand = ref(false)

  const hasPendingBatch = computed(() => batchPromise.value != null)

  function setBatchPromise(promise: Promise<void> | null) {
    batchPromise.value = promise
  }

  function setTargetJobIds(jobIds: string[]) {
    activeTargetJobIds.value = [...jobIds]
    remainingTargetJobIds.value = [...jobIds]
  }

  function clearTargetJobState() {
    activeTargetJobIds.value = []
    remainingTargetJobIds.value = []
  }

  function consumeSeenJobIds(seenJobIds: string[]) {
    if (seenJobIds.length === 0 || remainingTargetJobIds.value.length === 0) {
      return remainingTargetJobIds.value.length
    }

    const seenJobIdSet = new Set(seenJobIds)
    remainingTargetJobIds.value = remainingTargetJobIds.value.filter(
      (jobId) => !seenJobIdSet.has(jobId),
    )
    return remainingTargetJobIds.value.length
  }

  function setStopRequestedByCommand(value: boolean) {
    stopRequestedByCommand.value = value
  }

  return {
    batchPromise,
    hasPendingBatch,
    activeTargetJobIds,
    remainingTargetJobIds,
    stopRequestedByCommand,
    setBatchPromise,
    setTargetJobIds,
    clearTargetJobState,
    consumeSeenJobIds,
    setStopRequestedByCommand,
  }
})