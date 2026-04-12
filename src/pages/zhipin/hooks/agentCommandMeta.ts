import {
  resolveBossHelperAgentErrorMeta,
  type BossHelperAgentResponseMeta,
  type BossHelperAgentSuggestedAction,
} from '@/message/agent'

import { collectAgentPageReadiness } from './agentReadiness'

const readinessDrivenErrorCodes = new Set([
  'chat-send-failed',
  'job-detail-load-failed',
  'job-detail-unavailable',
  'missing-form-uid',
  'resume-load-failed',
])

function isRetryableAction(action?: BossHelperAgentSuggestedAction) {
  switch (action) {
    case 'navigate':
    case 'refresh-page':
    case 'reconnect-relay':
    case 'retry':
      return true
    case 'continue':
    case 'fix-input':
    case 'stop':
    case 'wait-login':
      return false
    default:
      return undefined
  }
}

export function resolveBossHelperAgentCommandFailureMeta(
  code: string,
  options: {
    preferReadiness?: boolean
  } = {},
): BossHelperAgentResponseMeta {
  const base = resolveBossHelperAgentErrorMeta(code)
  if (!options.preferReadiness || !readinessDrivenErrorCodes.has(code)) {
    return base
  }

  const readiness = collectAgentPageReadiness()
  if (readiness.suggestedAction === 'continue') {
    return base
  }

  const retryable = isRetryableAction(readiness.suggestedAction)
  return {
    ...base,
    ...(retryable === undefined ? {} : { retryable }),
    suggestedAction: readiness.suggestedAction,
  }
}