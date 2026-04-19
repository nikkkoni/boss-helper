// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChat } from '@/composables/useChat'
import { resolveBossHelperAgentErrorMeta, type BossHelperAgentResponseMeta } from '@/message/agent'
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

    async send() {
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
    requestBossData: vi.fn(),
    registerUserConfigSnapshotGetter: vi.fn(),
  }
})

vi.mock('@/composables/useWebSocket', () => ({
  Message: chatQueryMocks.MockMessage,
}))

vi.mock('@/composables/useApplying/utils', () => ({
  requestBossData: chatQueryMocks.requestBossData,
}))

vi.mock('@/pages/zhipin/hooks/agentEvents', () => ({
  createBossHelperAgentEvent: chatQueryMocks.createBossHelperAgentEvent,
  emitBossHelperAgentEvent: chatQueryMocks.emitBossHelperAgentEvent,
}))

vi.mock('@/stores/user', () => ({
  registerUserConfigSnapshotGetter: chatQueryMocks.registerUserConfigSnapshotGetter,
  useUser: () => ({
    getUserId: chatQueryMocks.getUserId,
  }),
}))

function createOptions(overrides: Partial<Parameters<typeof useAgentChatQueries>[0]> = {}) {
  return {
    currentProgressSnapshot: () => ({ current: 1, total: 2 }),
    ensureStoresLoaded: vi.fn(async () => undefined),
    ensureSupportedPage: () => true,
    fail: async (code: string, message: string, meta?: BossHelperAgentResponseMeta) => ({
      code,
      message,
      ok: false,
      ...resolveBossHelperAgentErrorMeta(code, meta),
      ...meta,
    }),
    ok: async (code: string, message: string, meta?: BossHelperAgentResponseMeta) => ({
      code,
      message,
      ok: true,
      ...meta,
    }),
    ...overrides,
  }
}

describe('useAgentChatQueries', () => {
  beforeEach(() => {
    setupPinia()
    window.history.replaceState({}, '', '/web/geek/job')
    document.title = 'Boss Jobs'
    document.body.innerHTML = `
      <div id="wrap">
        <div class="job-search-wrapper"></div>
        <div class="page-job-wrapper"></div>
      </div>
      <div id="boss-helper"></div>
      <div id="boss-helper-job"></div>
    `
    useChat().chatMessages.value = []
    useCommon().deliverState = 'running'
    chatQueryMocks.sentPayloads.length = 0
    chatQueryMocks.sendMock.mockReset()
    chatQueryMocks.emitBossHelperAgentEvent.mockReset()
    chatQueryMocks.createBossHelperAgentEvent.mockClear()
    chatQueryMocks.getUserId.mockReset()
    chatQueryMocks.getUserId.mockReturnValue('user-1')
    chatQueryMocks.requestBossData.mockReset()
    chatQueryMocks.registerUserConfigSnapshotGetter.mockClear()
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
    expect(listResponse.data?.totalConversations).toBe(2)
    expect(listResponse.data?.pendingReplyCount).toBe(1)
    expect(listResponse.data?.conversations).toHaveLength(1)
    expect(listResponse.data?.conversations[0]).toEqual(
      expect.objectContaining({
        conversationId: 'boss-2',
        latestRole: 'boss',
        needsReply: true,
      }),
    )

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
    const fail = vi.fn(async (code: string, message: string, meta?: BossHelperAgentResponseMeta) => ({
      code,
      message,
      ok: false,
      ...resolveBossHelperAgentErrorMeta(code, meta),
      ...meta,
    }))
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
      retryable: true,
      suggestedAction: 'navigate',
    })

    const supportedQueries = useAgentChatQueries(createOptions({ fail }))

    await expect(supportedQueries.chatHistory()).resolves.toEqual(
      expect.objectContaining({ code: 'missing-conversation-id', ok: false }),
    )
    await expect(
      supportedQueries.chatSend({ confirmHighRisk: true, content: ' ', to_name: 'Boss', to_uid: '1' }),
    ).resolves.toEqual({
      code: 'missing-content',
      message: '缺少聊天内容',
      ok: false,
      retryable: false,
      suggestedAction: 'fix-input',
    })
    await expect(
      supportedQueries.chatSend({ confirmHighRisk: true, content: 'hello', to_name: ' ', to_uid: '' }),
    ).resolves.toEqual({
      code: 'missing-chat-target',
      message: '缺少 to_uid 或 to_name',
      ok: false,
      retryable: false,
      suggestedAction: 'fix-input',
    })
    await expect(
      supportedQueries.chatSend({ confirmHighRisk: false, content: 'hello', to_name: 'Boss', to_uid: '1' }),
    ).resolves.toEqual({
      code: 'high-risk-action-confirmation-required',
      message: 'chat.send 属于高风险动作，需在 payload 中显式传 confirmHighRisk=true 后才会执行',
      ok: false,
      retryable: false,
      suggestedAction: 'fix-input',
    })

    chatQueryMocks.getUserId.mockReturnValueOnce(null as unknown as string)
    await expect(
      supportedQueries.chatSend({ confirmHighRisk: true, content: 'hello', to_name: 'Boss', to_uid: '1' }),
    ).resolves.toEqual({
      code: 'missing-form-uid',
      message: '缺少 form_uid，且当前页面未获取到用户 ID',
      ok: false,
      retryable: false,
      suggestedAction: 'fix-input',
    })
  })

  it('filters chat.list to pending-reply conversations without losing total context', async () => {
    const chat = useChat()
    chat.appendChatMessage({
      avatar: '',
      content: 'boss latest',
      conversationId: 'boss-1',
      createdAt: new Date('2026-04-10T00:00:01').getTime(),
      date: ['2026-04-10', '00:00:01'],
      id: 1,
      name: 'Boss One',
      role: 'boss',
    })
    chat.appendChatMessage({
      avatar: '',
      content: 'boss first',
      conversationId: 'boss-2',
      createdAt: new Date('2026-04-10T00:00:02').getTime(),
      date: ['2026-04-10', '00:00:02'],
      id: 2,
      name: 'Boss Two',
      role: 'boss',
    })
    chat.appendChatMessage({
      avatar: '',
      content: 'my reply',
      conversationId: 'boss-2',
      createdAt: new Date('2026-04-10T00:00:03').getTime(),
      date: ['2026-04-10', '00:00:03'],
      id: 3,
      name: 'Me',
      role: 'user',
    })

    const queries = useAgentChatQueries(createOptions())
    const response = await queries.chatList({ pendingReplyOnly: true })

    expect(response).toEqual(
      expect.objectContaining({
        code: 'chat-list',
        ok: true,
      }),
    )
    expect(response.data).toEqual(
      expect.objectContaining({
        pendingReplyCount: 1,
        total: 1,
        totalConversations: 2,
        conversations: [
          expect.objectContaining({
            conversationId: 'boss-1',
            latestRole: 'boss',
            needsReply: true,
          }),
        ],
      }),
    )
  })

  it('sends chat messages and emits structured events', async () => {
    const ok = vi.fn(async (code: string, message: string, meta?: BossHelperAgentResponseMeta) => ({
      code,
      message,
      ok: true,
      ...meta,
    }))
    const queries = useAgentChatQueries(createOptions({ ok }))

    const response = await queries.chatSend({
      confirmHighRisk: true,
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

    const listResponse = await queries.chatList({ limit: 10 })
    expect(listResponse.data?.conversations).toEqual([
      expect.objectContaining({
        conversationId: 'uid:9',
        latestMessage: 'hi boss',
        latestRole: 'user',
        name: 'Boss',
        to_name: 'Boss',
        to_uid: '9',
      }),
    ])
  })

  it('returns chat-send-failed when the websocket sender throws', async () => {
    const fail = vi.fn(async (code: string, message: string, meta?: BossHelperAgentResponseMeta) => ({
      code,
      message,
      ok: false,
      ...resolveBossHelperAgentErrorMeta(code, meta),
      ...meta,
    }))
    chatQueryMocks.sendMock.mockImplementation(() => {
      throw new Error('socket down')
    })

    const queries = useAgentChatQueries(createOptions({ fail }))
    await expect(
      queries.chatSend({ confirmHighRisk: true, content: 'hello', to_name: 'Boss', to_uid: '1' }),
    ).resolves.toEqual({
      code: 'chat-send-failed',
      message: 'socket down',
      ok: false,
      retryable: true,
      suggestedAction: 'retry',
    })
  })

  it('resolves chat targets from encryptJobId when explicit target fields are missing', async () => {
    const queries = useAgentChatQueries(createOptions())
    const item = {
      card: {
        encryptBossId: 'boss-encrypt',
      },
      encryptJobId: 'job-1',
      getCard: vi.fn(async function(this: any) {
        return this.card
      }),
    }
    ;(await import('@/stores/jobs')).jobList.replace([item as any])
    ;(await import('@/stores/jobs')).jobList.set('job-1', item as any)
    chatQueryMocks.requestBossData.mockResolvedValueOnce({
      data: {
        bossId: 7,
        encryptBossId: 'boss-encrypt',
      },
    })

    const response = await queries.chatSend({
      confirmHighRisk: true,
      content: 'hello by job',
      encryptJobId: 'job-1',
      to_name: '',
      to_uid: '',
    })

    expect(response).toEqual({ code: 'chat-sent', message: '消息已发送', ok: true })
    expect(chatQueryMocks.sentPayloads).toEqual([
      {
        content: 'hello by job',
        form_uid: 'user-1',
        to_name: 'boss-encrypt',
        to_uid: '7',
      },
    ])
  })
})
