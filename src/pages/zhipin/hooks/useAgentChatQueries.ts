import { useChat } from '@/composables/useChat'
import { Message } from '@/composables/useWebSocket'
import { requestBossData } from '@/composables/useApplying/utils'
import {
  createBossHelperAgentResponse,
  type BossHelperAgentChatConversation,
  type BossHelperAgentChatHistoryData,
  type BossHelperAgentChatHistoryPayload,
  type BossHelperAgentChatListData,
  type BossHelperAgentChatListPayload,
  type BossHelperAgentChatMessage,
  type BossHelperAgentChatSendPayload,
} from '@/message/agent'
import { jobList } from '@/stores/jobs'
import { useCommon } from '@/stores/common'
import { useConf } from '@/stores/conf'
import { useUser } from '@/stores/user'
import { recordOutgoingChatMessage } from '../services/chatStreamMessages'

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

function toAgentChatConversation(
  item: ReturnType<typeof useChat>['listChatConversations'] extends (...args: any[]) => { items: infer T }
    ? T extends Array<infer U>
      ? U
      : never
    : never,
): BossHelperAgentChatConversation {
  return {
    conversationId: item.conversationId,
    latestMessage: item.latestMessage,
    latestRole: item.latestRole,
    latestTimestamp: item.latestTimestamp,
    messageCount: item.messageCount,
    name: item.name,
    needsReply: item.needsReply,
    roles: item.roles,
    to_name: item.targetName,
    to_uid: item.targetUid,
  }
}

function getJobById(encryptJobId: string) {
  return jobList.get(encryptJobId) ?? jobList.list.find((item) => item.encryptJobId === encryptJobId)
}

export function useAgentChatQueries(options: UseAgentQueriesOptions) {
  const chat = useChat()
  const common = useCommon()
  const conf = useConf()

  async function resolveChatTarget(payload: BossHelperAgentChatSendPayload) {
    const toUid = payload.to_uid == null ? '' : String(payload.to_uid).trim()
    const toName = payload.to_name?.trim() ?? ''
    if (toUid && toName) {
      return {
        to_name: toName,
        to_uid: toUid,
      }
    }

    if (!payload.encryptJobId?.trim()) {
      return null
    }

    const item = getJobById(payload.encryptJobId.trim())
    if (!item) {
      throw new Error('当前页面未找到指定岗位')
    }

    if (!item.card) {
      await item.getCard()
    }

    if (!item.card) {
      throw new Error('岗位详情暂不可用')
    }

    const bossData = await requestBossData(item.card)
    const resolvedUid = bossData.data?.bossId == null ? '' : String(bossData.data.bossId).trim()
    const resolvedName = bossData.data?.encryptBossId?.trim() ?? ''
    if (!resolvedUid || !resolvedName) {
      throw new Error('未能解析聊天目标')
    }

    return {
      to_name: resolvedName,
      to_uid: resolvedUid,
    }
  }

  async function chatList(payload?: BossHelperAgentChatListPayload) {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentChatListData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }

    const result = chat.listChatConversations({
      limit: payload?.limit,
      pendingReplyOnly: payload?.pendingReplyOnly,
    })
    return createBossHelperAgentResponse(true, 'chat-list', '已返回当前页面聊天会话', {
      conversations: result.items.map(toAgentChatConversation),
      pendingReplyCount: result.pendingReplyCount,
      total: result.total,
      totalConversations: result.totalBeforeFilter,
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
      const target = await resolveChatTarget(payload)
      if (!target) {
        return options.fail('missing-chat-target', '缺少 to_uid 或 to_name')
      }

      const message = new Message({
        form_uid: String(userId),
        to_uid: target.to_uid,
        to_name: target.to_name,
        content: payload.content.trim(),
      })
      await message.send({
        timeoutMs: Math.max(0, conf.formData.delay.messageSending) * 1000,
      })
      recordOutgoingChatMessage({
        content: payload.content.trim(),
        createdAt: 'createdAt' in message && typeof message.createdAt === 'number' ? message.createdAt : undefined,
        form_uid: String(userId),
        messageId: 'messageId' in message && typeof message.messageId === 'string' ? message.messageId : undefined,
        to_name: target.to_name,
        to_uid: target.to_uid,
      })

      emitBossHelperAgentEvent(
        createBossHelperAgentEvent({
          type: 'chat-sent',
          state: common.deliverState,
          message: `消息已发送给 ${target.to_name}`,
          progress: options.currentProgressSnapshot(),
          detail: {
            to_uid: target.to_uid,
            to_name: target.to_name,
            content: payload.content.trim(),
            ...(payload.encryptJobId?.trim() ? { encryptJobId: payload.encryptJobId.trim() } : {}),
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
