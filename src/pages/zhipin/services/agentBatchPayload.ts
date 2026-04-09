import type { BossHelperAgentStartPayload } from '@/message/agent'
import type { useAgentRuntime } from '@/stores/agent'
import type { useConf } from '@/stores/conf'
import { jobList } from '@/stores/jobs'

import { resetJobStatuses } from '../shared/jobMapping'

function normalizeTargetJobIds(jobIds?: string[]) {
  if (!jobIds?.length) {
    return []
  }

  return [...new Set(jobIds.map((id) => id.trim()).filter(Boolean))]
}

/**
 * 把 `start` 命令的运行时补丁应用到页面状态。
 *
 * 这里统一处理目标岗位集合、运行时配置 patch 和可选的状态重置，
 * 避免 batch runner 在启动前自行拼装多套分支逻辑。
 */
export async function applyAgentBatchStartPayload(options: {
  agentRuntime: ReturnType<typeof useAgentRuntime>
  conf: ReturnType<typeof useConf>
  payload?: BossHelperAgentStartPayload
}) {
  const { agentRuntime, conf, payload } = options
  const targetJobIds = normalizeTargetJobIds(payload?.jobIds)
  agentRuntime.setTargetJobIds(targetJobIds)

  if (payload?.configPatch && Object.keys(payload.configPatch).length > 0) {
    await conf.applyRuntimeConfigPatch(payload.configPatch, {
      persist: payload.persistConfig,
    })
  }

  if (payload?.resetFiltered && targetJobIds.length === 0) {
    resetJobStatuses(jobList._list.value, (job) => job.status.status !== 'success')
  }
}
