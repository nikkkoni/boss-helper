import {
  BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
  BOSS_HELPER_AGENT_EVENT_BRIDGE,
  createBossHelperAgentResponse,
  isBossHelperAgentBridgeRequest,
  type BossHelperAgentController,
  type BossHelperAgentEvent,
} from '@/message/agent'
import { isBossHelperSameOriginWindowMessage, postBossHelperWindowMessage } from '@/message/window'
import { jsonClone } from '@/utils/deepmerge'

import { onBossHelperAgentEvent } from './agentEvents'

type AgentEventSubscriber = (listener: (payload: BossHelperAgentEvent) => void) => () => void

export function registerWindowAgentBridge(options: {
  controller: BossHelperAgentController
  onEvent?: AgentEventSubscriber
  targetWindow?: Window & typeof globalThis
}) {
  const targetWindow = options.targetWindow ?? window
  const onEvent = options.onEvent ?? onBossHelperAgentEvent

  if (import.meta.env.DEV) {
    targetWindow.__bossHelperAgent = options.controller
  }

  const stopAgentEventBridge = onEvent((payload) => {
    postBossHelperWindowMessage(targetWindow, {
      type: BOSS_HELPER_AGENT_EVENT_BRIDGE,
      payload: jsonClone(payload),
    })
  })

  const onMessage = (event: MessageEvent) => {
    if (
      !isBossHelperSameOriginWindowMessage(event, targetWindow) ||
      !isBossHelperAgentBridgeRequest(event.data)
    ) {
      return
    }

    void options.controller
      .handle(event.data.payload)
      .catch((error) =>
        createBossHelperAgentResponse(
          false,
          'controller-error',
          error instanceof Error ? error.message : '未知错误',
        ),
      )
      .then((payload) => {
        postBossHelperWindowMessage(targetWindow, {
          type: BOSS_HELPER_AGENT_BRIDGE_RESPONSE,
          requestId: event.data.requestId,
          payload: jsonClone(payload),
        })
      })
  }

  targetWindow.addEventListener('message', onMessage)

  return () => {
    stopAgentEventBridge()
    if (import.meta.env.DEV && targetWindow.__bossHelperAgent === options.controller) {
      delete targetWindow.__bossHelperAgent
    }
    targetWindow.removeEventListener('message', onMessage)
  }
}
