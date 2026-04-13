import { useChat } from '@/composables/useChat'
import { Message } from '@/composables/useWebSocket'
import {
  createBossHelperAgentResponse,
  type BossHelperAgentChatHistoryData,
  type BossHelperAgentChatHistoryPayload,
  type BossHelperAgentChatListData,
  type BossHelperAgentChatListPayload,
  type BossHelperAgentChatMessage,
  type BossHelperAgentChatSendPayload,
} from '@/message/agent'
import { useCommon } from '@/stores/common'
import { useUser } from '@/stores/user'

import { createBossHelperAgentEvent, emitBossHelperAgentEvent } from './agentEvents'
import { resolveBossHelperAgentCommandFailureMeta } from './agentCommandMeta'
import type { UseAgentQueriesOptions } from './agentQueryShared'

function toAgentChatMessage(
  conversationId: string,
  item: ReturnType<typeof useChat>['chatMessages']['value'][number],
): BossHelperAgentChatMessage {
  return {
    conversationId,
    id: item.id,
    role: item.role,
    name: item.name,
    content: item.content,
    timestamp: `${item.date[0]} ${item.date[1]}`,
  }
}

export function useAgentChatQueries(options: UseAgentQueriesOptions) {
  const chat = useChat()
  const common = useCommon()

  async function chatList(payload?: BossHelperAgentChatListPayload) {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentChatListData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }

    const result = chat.listChatConversations(payload?.limit ?? 20)
    return createBossHelperAgentResponse(true, 'chat-list', '已返回当前页面聊天会话', {
      conversations: result.items,
      total: result.total,
    })
  }

  async function chatHistory(payload?: BossHelperAgentChatHistoryPayload) {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentChatHistoryData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }
    if (!payload?.conversationId?.trim()) {
      return createBossHelperAgentResponse<BossHelperAgentChatHistoryData>(
        false,
        'missing-conversation-id',
        '缺少 conversationId',
      )
    }

    const conversationId = payload.conversationId.trim()
    const result = chat.getChatHistory(conversationId, payload.offset ?? 0, payload.limit ?? 50)

    return createBossHelperAgentResponse(true, 'chat-history', '已返回当前页面聊天记录', {
      conversationId,
      items: result.items.map((item) => toAgentChatMessage(conversationId, item)),
      limit: result.limit,
      offset: result.offset,
      total: result.total,
    })
  }

  async function chatSend(payload?: BossHelperAgentChatSendPayload) {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return options.fail('unsupported-page', '当前页面不支持自动投递')
    }
    if (!payload?.content?.trim()) {
      return options.fail('missing-content', '缺少聊天内容')
    }
    if (!payload.to_uid || !payload.to_name?.trim()) {
      return options.fail('missing-chat-target', '缺少 to_uid 或 to_name')
    }
    if (payload.confirmHighRisk !== true) {
      return options.fail(
        'high-risk-action-confirmation-required',
        'chat.send 属于高风险动作，需在 payload 中显式传 confirmHighRisk=true 后才会执行',
      )
    }

    const userId = payload.form_uid ?? useUser().getUserId()
    if (userId == null || userId === '') {
      return options.fail(
        'missing-form-uid',
        '缺少 form_uid，且当前页面未获取到用户 ID',
        resolveBossHelperAgentCommandFailureMeta('missing-form-uid', { preferReadiness: true }),
      )
    }

    try {
      const message = new Message({
        form_uid: String(userId),
        to_uid: String(payload.to_uid),
        to_name: payload.to_name.trim(),
        content: payload.content.trim(),
      })
      message.send()

      emitBossHelperAgentEvent(
        createBossHelperAgentEvent({
          type: 'chat-sent',
          state: common.deliverState,
          message: `消息已发送给 ${payload.to_name.trim()}`,
          progress: options.currentProgressSnapshot(),
          detail: {
            to_uid: String(payload.to_uid),
            to_name: payload.to_name.trim(),
            content: payload.content.trim(),
          },
        }),
      )

      return options.ok('chat-sent', '消息已发送')
    } catch (error) {
      return options.fail(
        'chat-send-failed',
        error instanceof Error ? error.message : '消息发送失败',
        resolveBossHelperAgentCommandFailureMeta('chat-send-failed', { preferReadiness: true }),
      )
    }
  }

  return {
    chatList,
    chatHistory,
    chatSend,
  }
}
