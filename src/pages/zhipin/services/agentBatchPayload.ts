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
