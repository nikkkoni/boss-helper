// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChat } from '@/composables/useChat'
import { useAgentChatQueries } from '@/pages/zhipin/hooks/useAgentChatQueries'
import { useCommon } from '@/stores/common'

import { setupPinia } from './helpers/pinia'

const chatQueryMocks = vi.hoisted(() => {
  const sentPayloads: Array<Record<string, unknown>> = []

  class MockMessage {
    payload: Record<string, unknown>

    constructor(payload: Record<string, unknown>) {
      this.payload = payload
      sentPayloads.push(payload)
    }

    send() {
      chatQueryMocks.sendMock(this.payload)
    }
  }

  return {
    MockMessage,
    sentPayloads,
    sendMock: vi.fn(),
    emitBossHelperAgentEvent: vi.fn(),
    createBossHelperAgentEvent: vi.fn((payload) => payload),
    getUserId: vi.fn(() => 'user-1'),
  }
})

vi.mock('@/composables/useWebSocket', () => ({
  Message: chatQueryMocks.MockMessage,
}))

vi.mock('@/pages/zhipin/hooks/agentEvents', () => ({
  createBossHelperAgentEvent: chatQueryMocks.createBossHelperAgentEvent,
  emitBossHelperAgentEvent: chatQueryMocks.emitBossHelperAgentEvent,
}))

vi.mock('@/stores/user', () => ({
  useUser: () => ({
    getUserId: chatQueryMocks.getUserId,
  }),
}))

function createOptions(overrides: Partial<Parameters<typeof useAgentChatQueries>[0]> = {}) {
  return {
    currentProgressSnapshot: () => ({ current: 1, total: 2 }),
    ensureStoresLoaded: vi.fn(async () => undefined),
    ensureSupportedPage: () => true,
    fail: async (code: string, message: string) => ({ code, message, ok: false }),
    ok: async (code: string, message: string) => ({ code, message, ok: true }),
    ...overrides,
  }
}

describe('useAgentChatQueries', () => {
  beforeEach(() => {
    setupPinia()
    useChat().chatMessages.value = []
    useCommon().deliverState = 'running'
    chatQueryMocks.sentPayloads.length = 0
    chatQueryMocks.sendMock.mockReset()
    chatQueryMocks.emitBossHelperAgentEvent.mockReset()
    chatQueryMocks.createBossHelperAgentEvent.mockClear()
    chatQueryMocks.getUserId.mockReset()
    chatQueryMocks.getUserId.mockReturnValue('user-1')
  })

  it('lists conversations and returns mapped chat history', async () => {
    const chat = useChat()
    chat.appendChatMessage({
      avatar: '',
      content: 'first',
      conversationId: 'boss-1',
      createdAt: new Date('2026-04-10T00:00:01').getTime(),
      date: ['2026-04-10', '00:00:01'],
      id: 1,
      name: 'Boss',
      role: 'boss',
    })
    chat.appendChatMessage({
      avatar: '',
      content: 'reply',
      conversationId: 'boss-1',
      createdAt: new Date('2026-04-10T00:00:02').getTime(),
      date: ['2026-04-10', '00:00:02'],
      id: 2,
      name: 'Me',
      role: 'user',
    })
    chat.appendChatMessage({
      avatar: '',
      content: 'other',
      conversationId: 'boss-2',
      createdAt: new Date('2026-04-10T00:00:03').getTime(),
      date: ['2026-04-10', '00:00:03'],
      id: 3,
      name: 'Other',
      role: 'boss',
    })

    const queries = useAgentChatQueries(createOptions())
    const listResponse = await queries.chatList({ limit: 1 })
    const historyResponse = await queries.chatHistory({
      conversationId: ' boss-1 ',
      limit: 5,
      offset: 0,
    })

    expect(listResponse).toEqual(
      expect.objectContaining({
        code: 'chat-list',
        ok: true,
      }),
    )
    expect(listResponse.data?.total).toBe(2)
    expect(listResponse.data?.conversations).toHaveLength(1)

    expect(historyResponse).toEqual(
      expect.objectContaining({
        code: 'chat-history',
        ok: true,
      }),
    )
    expect(historyResponse.data).toEqual(
      expect.objectContaining({
        conversationId: 'boss-1',
        total: 2,
        items: [
          expect.objectContaining({
            content: 'first',
            conversationId: 'boss-1',
            role: 'boss',
            timestamp: expect.any(String),
          }),
          expect.objectContaining({
            content: 'reply',
            conversationId: 'boss-1',
            role: 'user',
            timestamp: expect.any(String),
          }),
        ],
      }),
    )
  })

  it('guards unsupported pages and invalid chat payloads', async () => {
    const fail = vi.fn(async (code: string, message: string) => ({ code, message, ok: false }))
    const queries = useAgentChatQueries(
      createOptions({
        ensureSupportedPage: () => false,
        fail,
      }),
    )

    await expect(queries.chatList()).resolves.toEqual(
      expect.objectContaining({ code: 'unsupported-page', ok: false }),
    )
    await expect(queries.chatHistory()).resolves.toEqual(
      expect.objectContaining({ code: 'unsupported-page', ok: false }),
    )
    await expect(queries.chatSend()).resolves.toEqual({
      code: 'unsupported-page',
      message: '当前页面不支持自动投递',
      ok: false,
    })

    const supportedQueries = useAgentChatQueries(createOptions({ fail }))

    await expect(supportedQueries.chatHistory()).resolves.toEqual(
      expect.objectContaining({ code: 'missing-conversation-id', ok: false }),
    )
    await expect(
      supportedQueries.chatSend({ content: ' ', to_name: 'Boss', to_uid: '1' }),
    ).resolves.toEqual({
      code: 'missing-content',
      message: '缺少聊天内容',
      ok: false,
    })
    await expect(
      supportedQueries.chatSend({ content: 'hello', to_name: ' ', to_uid: '' }),
    ).resolves.toEqual({
      code: 'missing-chat-target',
      message: '缺少 to_uid 或 to_name',
      ok: false,
    })

    chatQueryMocks.getUserId.mockReturnValueOnce(null as unknown as string)
    await expect(
      supportedQueries.chatSend({ content: 'hello', to_name: 'Boss', to_uid: '1' }),
    ).resolves.toEqual({
      code: 'missing-form-uid',
      message: '缺少 form_uid，且当前页面未获取到用户 ID',
      ok: false,
    })
  })

  it('sends chat messages and emits structured events', async () => {
    const ok = vi.fn(async (code: string, message: string) => ({ code, message, ok: true }))
    const queries = useAgentChatQueries(createOptions({ ok }))

    const response = await queries.chatSend({
      content: ' hi boss ',
      to_name: ' Boss ',
      to_uid: 9,
    })

    expect(response).toEqual({ code: 'chat-sent', message: '消息已发送', ok: true })
    expect(chatQueryMocks.sentPayloads).toEqual([
      {
        content: 'hi boss',
        form_uid: 'user-1',
        to_name: 'Boss',
        to_uid: '9',
      },
    ])
    expect(chatQueryMocks.emitBossHelperAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          content: 'hi boss',
          to_name: 'Boss',
          to_uid: '9',
        },
        message: '消息已发送给 Boss',
        progress: { current: 1, total: 2 },
        state: 'running',
        type: 'chat-sent',
      }),
    )
  })

  it('returns chat-send-failed when the websocket sender throws', async () => {
    const fail = vi.fn(async (code: string, message: string) => ({ code, message, ok: false }))
    chatQueryMocks.sendMock.mockImplementation(() => {
      throw new Error('socket down')
    })

    const queries = useAgentChatQueries(createOptions({ fail }))
    await expect(
      queries.chatSend({ content: 'hello', to_name: 'Boss', to_uid: '1' }),
    ).resolves.toEqual({
      code: 'chat-send-failed',
      message: 'socket down',
      ok: false,
    })
  })
})
