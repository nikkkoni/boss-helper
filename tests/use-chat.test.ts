// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import { useChat } from '@/composables/useChat'

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

    const conversations = chat.listChatConversations(10)

    expect(conversations.total).toBe(2)
    expect(conversations.items).toEqual([
      expect.objectContaining({
        conversationId: 'room-1',
        latestMessage: 'later',
        messageCount: 2,
        roles: ['user', 'boss'],
      }),
      expect.objectContaining({
        conversationId: 'Helper',
        latestMessage: 'assistant reply',
        messageCount: 1,
        roles: ['assistant'],
      }),
    ])

    expect(chat.getChatHistory('room-1', 0, 10).items.map((item) => item.content)).toEqual([
      'earlier',
      'later',
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
})
