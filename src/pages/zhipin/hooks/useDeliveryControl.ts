import { useChat } from '@/composables/useChat'
import { createBossHelperAgentResponse } from '@/message/agent'
import { isSupportedSiteUrl } from '@/site-adapters'
import { useConf } from '@/stores/conf'
import { useLog } from '@/stores/log'

import { createAgentController } from './agentController'
import { onBossHelperAgentEvent } from './agentEvents'
import { registerWindowAgentBridge as setupWindowAgentBridge } from './agentWindowBridge'
import { useAgentBatchRunner } from './useAgentBatchRunner'
import { useAgentQueries } from './useAgentQueries'

/**
 * 页面侧 agent 控制器入口。
 *
 * 它把扩展 UI、window bridge、runtime 消息和批处理 runner 统一到同一套命令接口，
 * 这样 `start`、`jobs.list`、`config.update` 等命令无论来自按钮还是外部 agent，
 * 都会走同一套校验和状态更新逻辑。
 */
export function useDeliveryControl() {
  useChat()
  useLog()
  const conf = useConf()

  async function ensureStoresLoaded() {
    if (!conf.isLoaded) {
      await conf.confInit()
    }
  }

  const batchRunner = useAgentBatchRunner({
    ensureStoresLoaded,
    ensureSupportedPage: () => isSupportedSiteUrl(location.href),
  })
  const {
    currentProgressSnapshot,
    pauseBatch,
    resetFilter,
    resumeBatch,
    startBatch,
    stats,
    stopBatch,
  } = batchRunner
  const ensureSupportedPage = () => isSupportedSiteUrl(location.href)
  const queries = useAgentQueries({
    currentProgressSnapshot,
    ensureStoresLoaded,
    ensureSupportedPage,
    ok: async (code, message) =>
      createBossHelperAgentResponse(true, code, message, await batchRunner.getStatsData()),
    fail: async (code, message) =>
      createBossHelperAgentResponse(false, code, message, await batchRunner.getStatsData()),
  })

  const controller = createAgentController({ batchRunner, queries })

  return {
    controller,
    pauseBatch,
    registerWindowAgentBridge: () =>
      setupWindowAgentBridge({ controller, onEvent: onBossHelperAgentEvent }),
    resetFilter,
    resumeBatch,
    startBatch,
    stopBatch,
    stats,
  }
}
