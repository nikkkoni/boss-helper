import {
  BOSS_HELPER_AGENT_BRIDGE_REQUEST,
  BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
  BOSS_HELPER_AGENT_EVENT_BRIDGE,
  createBossHelperAgentResponse,
  isBossHelperAgentBridgeRequest,
  type BossHelperAgentBridgeResponse,
  type BossHelperAgentResponse,
  type BossHelperAgentController,
  type BossHelperAgentEvent,
} from '@/message/agent'
import {
  getBossHelperWindowBridgeTarget,
  onBossHelperWindowMessage,
  postBossHelperWindowMessage,
} from '@/message/window'
import { jsonClone } from '@/utils/deepmerge'

import { onBossHelperAgentEvent } from './agentEvents'

type AgentEventSubscriber = (listener: (payload: BossHelperAgentEvent) => void) => () => void

export function registerWindowAgentBridge(options: {
  controller: BossHelperAgentController
  onEvent?: AgentEventSubscriber
  targetWindow?: EventTarget
}) {
  const targetWindow = options.targetWindow ?? getBossHelperWindowBridgeTarget()
  const onEvent = options.onEvent ?? onBossHelperAgentEvent

  if (import.meta.env.DEV) {
    window.__bossHelperAgent = options.controller
  }

  const stopAgentEventBridge = onEvent((payload) => {
    postBossHelperWindowMessage(targetWindow, {
      payload: jsonClone(payload),
      source: 'main-world',
      type: BOSS_HELPER_AGENT_EVENT_BRIDGE,
    })
  })

  const stopBridgeRequests = onBossHelperWindowMessage(
    targetWindow,
    (payload, message) => {
      if (message.source === 'main-world') {
        return
      }
      if (!isBossHelperAgentBridgeRequest(payload)) {
        return
      }

      void options.controller
        .handle(payload.payload)
        .catch((error) =>
          createBossHelperAgentResponse(
            false,
            'controller-error',
            error instanceof Error ? error.message : '未知错误',
          ),
        )
        .then((responsePayload) => {
          const response: BossHelperAgentResponse<unknown> = jsonClone(responsePayload)
          const bridgeResponse: BossHelperAgentBridgeResponse = {
            payload: response,
            requestId: payload.requestId,
            type: BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
          }
          postBossHelperWindowMessage(targetWindow, {
            payload: bridgeResponse,
            source: 'main-world',
            type: BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
          })
        })
    },
    { messageType: BOSS_HELPER_AGENT_BRIDGE_REQUEST },
  )

  return () => {
    stopAgentEventBridge()
    stopBridgeRequests()
    if (import.meta.env.DEV && window.__bossHelperAgent === options.controller) {
      delete window.__bossHelperAgent
    }
  }
}
