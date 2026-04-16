// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChat } from '@/composables/useChat'
import { useChatPromptBridge } from '@/composables/useApplying/services/chatPrompt'

function createChatMessage(overrides: Partial<ReturnType<typeof useChat>['chatMessages']['value'][number]> = {}) {
  return {
    avatar: 'avatar',
    content: 'message',
    createdAt: 1_000,
    date: ['2026-04-10', '00:00:01'] as [string, string],
    id: 1,
    name: 'Boss',
    role: 'boss' as const,
    ...overrides,
  }
}

describe('useChat', () => {
  beforeEach(() => {
    const chat = useChat()
    chat.chatMessages.value = []
    chat.chatInput.content = ''
    chat.chatInput.input = false
    chat.chatInput.role = 'user'
    chat.chatInput.name = undefined
    chat.chatInput.avatar = undefined
  })

  it('groups conversations by explicit or fallback ids and sorts history by time', () => {
    const chat = useChat()

    chat.appendChatMessage(
      createChatMessage({
        content: 'later',
        conversationId: ' room-1 ',
        createdAt: 2_000,
        id: 2,
        role: 'user',
      }),
    )
    chat.appendChatMessage(
      createChatMessage({
        content: 'earlier',
        conversationId: 'room-1',
        createdAt: 1_000,
        id: 1,
      }),
    )
    chat.appendChatMessage(
      createChatMessage({
        content: 'assistant reply',
        createdAt: 1_500,
        id: 3,
        name: 'Helper',
        role: 'assistant',
      }),
    )

    const conversations = chat.listChatConversations({ limit: 10 })

    expect(conversations.total).toBe(2)
    expect(conversations.items).toEqual([
      expect.objectContaining({
        conversationId: 'room-1',
        latestMessage: 'later',
        latestRole: 'user',
        messageCount: 2,
        needsReply: false,
        roles: ['user', 'boss'],
      }),
      expect.objectContaining({
        conversationId: 'Helper',
        latestMessage: 'assistant reply',
        latestRole: 'assistant',
        messageCount: 1,
        needsReply: false,
        roles: ['assistant'],
      }),
    ])
    expect(conversations.pendingReplyCount).toBe(0)
    expect(conversations.totalBeforeFilter).toBe(2)

    expect(chat.getChatHistory('room-1', 0, 10).items.map((item) => item.content)).toEqual([
      'earlier',
      'later',
    ])
  })

  it('marks boss-latest conversations as pending reply and filters them when requested', () => {
    const chat = useChat()

    chat.appendChatMessage(
      createChatMessage({
        content: 'boss latest',
        conversationId: 'room-boss',
        createdAt: 3_000,
        id: 3,
        role: 'boss',
      }),
    )
    chat.appendChatMessage(
      createChatMessage({
        content: 'user latest',
        conversationId: 'room-user',
        createdAt: 4_000,
        id: 4,
        role: 'user',
      }),
    )

    const allConversations = chat.listChatConversations({ limit: 10 })
    const pendingOnly = chat.listChatConversations({ limit: 10, pendingReplyOnly: true })

    expect(allConversations.pendingReplyCount).toBe(1)
    expect(allConversations.total).toBe(2)
    expect(allConversations.totalBeforeFilter).toBe(2)
    expect(allConversations.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: 'room-boss',
          latestRole: 'boss',
          needsReply: true,
        }),
        expect.objectContaining({
          conversationId: 'room-user',
          latestRole: 'user',
          needsReply: false,
        }),
      ]),
    )
    expect(pendingOnly.pendingReplyCount).toBe(1)
    expect(pendingOnly.total).toBe(1)
    expect(pendingOnly.totalBeforeFilter).toBe(2)
    expect(pendingOnly.items).toEqual([
      expect.objectContaining({
        conversationId: 'room-boss',
        latestRole: 'boss',
        needsReply: true,
      }),
    ])
  })

  it('deduplicates messages by dedupe key', () => {
    const chat = useChat()

    expect(
      chat.appendChatMessage(
        createChatMessage({
          data: { dedupeKey: 'use-chat-dedupe-1' },
        }),
      ),
    ).toBe(true)
    expect(
      chat.appendChatMessage(
        createChatMessage({
          content: 'duplicate',
          data: { dedupeKey: 'use-chat-dedupe-1' },
          id: 2,
        }),
      ),
    ).toBe(false)

    expect(chat.chatMessages.value).toHaveLength(1)
  })

  it('collects streaming assistant input and commits the final message once', () => {
    const chat = useChat()
    const stream = chat.chatInputInit({
      color: '#00f',
      data: {
        advanced: {},
        api_key: 'test-key',
        model: 'gpt-test',
        mode: 'openai',
        other: {},
        url: 'https://example.com/v1',
      },
      key: 'model-1',
      name: 'GPT',
    })

    stream.handle('你')
    stream.handle('好')

    expect(chat.chatInput.content).toBe('你好')
    expect(chat.chatInput.input).toBe(true)
    expect(chat.chatInput.role).toBe('assistant')

    stream.end('完整回复')
    stream.end('不会重复写入')

    expect(chat.chatInput.content).toBe('')
    expect(chat.chatInput.input).toBe(false)
    expect(chat.chatMessages.value).toHaveLength(1)
    expect(chat.chatMessages.value[0]).toEqual(
      expect.objectContaining({
        avatar: expect.objectContaining({ color: '#00f' }),
        content: '完整回复',
        name: 'GPT',
        role: 'assistant',
      }),
    )
  })

  it('issues monotonic ids for assistant and boss messages within the same millisecond', () => {
    const fixedNow = new Date('2026-04-10T00:00:05')
    const chat = useChat()
    const stream = chat.chatInputInit({
      color: '#00f',
      data: {
        advanced: {},
        api_key: 'test-key',
        model: 'gpt-test',
        mode: 'openai',
        other: {},
        url: 'https://example.com/v1',
      },
      key: 'model-1',
      name: 'GPT',
    })
    const { chatBossMessage } = useChatPromptBridge()

    try {
      vi.useFakeTimers()
      vi.setSystemTime(fixedNow)
      stream.end('assistant message')
      chatBossMessage(
        {
          listData: {
            brandLogo: 'logo',
            brandName: 'Boss Inc',
          },
        } as never,
        'boss message',
      )
    } finally {
      vi.useRealTimers()
    }

    expect(chat.chatMessages.value).toHaveLength(2)
    expect(chat.chatMessages.value[0].id).toBeLessThan(chat.chatMessages.value[1].id)
  })
})
