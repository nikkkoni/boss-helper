import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { BossHelperAgentState } from '@/message/agent'

export const useCommon = defineStore('common', () => {
  const deliverLock = ref(false)
  const deliverStop = ref(false)
  const deliverState = ref<BossHelperAgentState>('idle')
  const deliverStatusMessage = ref('未开始')
  const appLoading = ref(false)

  return {
    deliverLock,
    deliverStop,
    deliverState,
    deliverStatusMessage,
    appLoading,
  }
})
