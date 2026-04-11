import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { BossHelperAgentState } from '@/message/agent'

/**
 * 全局投递运行态 store。
 *
 * 虽然 API 形态是 `use*`，但这里是应用级 Pinia store，不是普通 composable。
 */
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
