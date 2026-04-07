import { reactive, ref, toRaw } from 'vue'

import { getCurDay, getCurTime } from '@/utils'

import type { modelData } from './useModel'
import { llmIcon } from './useModel'

export type ChatMessages = ChatMessage[]

export interface ChatMessage {
  id: number
  role: 'boss' | 'user' | 'assistant'
  name?: string
  content: string
  date: [string, string]
  conversationId?: string
  createdAt?: number
  avatar: string | ChatAvatar
  url?: string
  data?: Record<string, any>
}

export interface ChatInput {
  role: 'user' | 'assistant'
  name?: string
  content: string
  input: boolean
  avatar?: ChatAvatar
}
export interface ChatAvatar {
  icon?: string
  color?: string
}

function getConversationId(message: Pick<ChatMessage, 'name' | 'role' | 'conversationId'>) {
  const explicitConversationId = message.conversationId?.trim()
  if (explicitConversationId) {
    return explicitConversationId
  }

  const base = (message.name ?? message.role ?? 'default').trim()
  return base || 'default'
}

function resolveMessageCreatedAt(message: Pick<ChatMessage, 'id' | 'date' | 'createdAt'>) {
  if (typeof message.createdAt === 'number' && Number.isFinite(message.createdAt)) {
    return message.createdAt
  }

  const parsed = Date.parse(`${message.date[0]}T${message.date[1]}`)
  if (Number.isFinite(parsed)) {
    return parsed
  }

  return message.id
}

function chatDateToTimestamp(message: Pick<ChatMessage, 'id' | 'date' | 'createdAt'>) {
  const createdAt = resolveMessageCreatedAt(message)
  const date = new Date(createdAt)
  return `${getCurDay(date)} ${getCurTime(date)}`
}

const chatMessages = ref<ChatMessages>([])
const seenChatMessageKeys = new Set<string>()
const seenChatMessageKeyQueue: string[] = []

function rememberChatMessageKey(key: string) {
  if (seenChatMessageKeys.has(key)) {
    return
  }

  seenChatMessageKeys.add(key)
  seenChatMessageKeyQueue.push(key)

  if (seenChatMessageKeyQueue.length > 1000) {
    const expired = seenChatMessageKeyQueue.shift()
    if (expired) {
      seenChatMessageKeys.delete(expired)
    }
  }
}

const chatInput = reactive<ChatInput>({
  role: 'user',
  content: '',
  input: false,
})

function chatInputInit(model: modelData) {
  chatInput.content = ''
  chatInput.input = true
  chatInput.role = 'assistant'
  chatInput.name = model.name
  chatInput.avatar = {
    icon: llmIcon[model.data?.mode || ''],
    color: model.color,
  }
  let end = false
  return {
    handle: (s: string) => {
      chatInput.content += s
    },
    end: (s: string) => {
      if (end) return
      end = true
      chatInput.input = false
      chatInput.content = s
      const d = new Date()
      chatMessages.value.push({
        id: d.getTime(),
        role: 'assistant',
        content: s,
        date: [getCurDay(d), getCurTime(d)],
        createdAt: d.getTime(),
        name: chatInput.name,
        avatar: toRaw(chatInput.avatar!),
      })
      chatInput.content = ''
    },
  }
}

function appendChatMessage(message: ChatMessage) {
  const dedupeKey = typeof message.data?.dedupeKey === 'string' ? message.data.dedupeKey : undefined
  if (dedupeKey && seenChatMessageKeys.has(dedupeKey)) {
    return false
  }

  if (dedupeKey) {
    rememberChatMessageKey(dedupeKey)
  }

  const createdAt = resolveMessageCreatedAt(message)
  const date = new Date(createdAt)
  chatMessages.value.push({
    ...message,
    createdAt,
    date: [getCurDay(date), getCurTime(date)],
  })
  return true
}

function listChatConversations(limit = 20) {
  const conversations = new Map<
    string,
    {
      conversationId: string
      latestMessage: string
      latestTimestamp: string
      latestCreatedAt: number
      messageCount: number
      name?: string
      roles: Set<ChatMessage['role']>
    }
  >()

  for (const message of chatMessages.value) {
    const conversationId = getConversationId(message)
    const existing = conversations.get(conversationId)
    const timestamp = chatDateToTimestamp(message)
    const createdAt = resolveMessageCreatedAt(message)

    if (!existing) {
      conversations.set(conversationId, {
        conversationId,
        latestMessage: message.content,
        latestTimestamp: timestamp,
        latestCreatedAt: createdAt,
        messageCount: 1,
        name: message.name,
        roles: new Set([message.role]),
      })
      continue
    }

    if (createdAt >= existing.latestCreatedAt) {
      existing.latestMessage = message.content
      existing.latestTimestamp = timestamp
      existing.latestCreatedAt = createdAt
      if (message.name) {
        existing.name = message.name
      }
    }
    existing.messageCount += 1
    if (!existing.name && message.name) {
      existing.name = message.name
    }
    existing.roles.add(message.role)
  }

  const safeLimit = Math.max(limit, 1)
  const items = [...conversations.values()]
    .map((conversation) => ({
      ...conversation,
      roles: [...conversation.roles],
    }))
    .sort((left, right) => right.latestCreatedAt - left.latestCreatedAt)

  return {
    items: items.slice(0, safeLimit),
    total: items.length,
  }
}

function getChatHistory(conversationId: string, offset = 0, limit = 50) {
  const items = chatMessages.value
    .filter((message) => getConversationId(message) === conversationId)
    .sort((left, right) => resolveMessageCreatedAt(left) - resolveMessageCreatedAt(right))
  const safeOffset = Math.max(offset, 0)
  const safeLimit = Math.max(limit, 1)

  return {
    total: items.length,
    offset: safeOffset,
    limit: safeLimit,
    items: items.slice(safeOffset, safeOffset + safeLimit),
  }
}

export function useChat() {
  return {
    chatMessages,
    chatInput,
    chatInputInit,
    appendChatMessage,
    listChatConversations,
    getChatHistory,
  }
}
