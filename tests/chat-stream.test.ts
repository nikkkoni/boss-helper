// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChat } from '@/composables/useChat'
import { mqtt } from '@/composables/useWebSocket/mqtt'
import { AwesomeMessage } from '@/composables/useWebSocket/type'
import { initBossChatStream } from '@/pages/zhipin/hooks/useChatStream'

const nativeWebSocketSend = WebSocket.prototype.send

function encodeProtocol(payload: Record<string, unknown>) {
  return AwesomeMessage.encode(payload).finish()
}

describe('initBossChatStream', () => {
  beforeEach(() => {
    useChat().chatMessages.value = []
    WebSocket.prototype.send = nativeWebSocketSend
    window.__bossHelperChatStreamInitialized = undefined
    window.ChatWebsocket = undefined
    window.socket = undefined as unknown as WebSocket
    window._PAGE = {
      uid: 1,
      userId: 1,
    } as Window['_PAGE']
  })

  it('captures websocket payloads and keeps conversation history ordered', async () => {
    const socket = new WebSocket('ws://localhost:1234')
    window.socket = socket
    initBossChatStream()
    const protocol = encodeProtocol({
      messages: [
        {
          body: {
            templateId: 1,
            text: '第二条',
            type: 1,
          },
          cmid: '2',
          from: { source: 0, uid: '2', name: 'Boss' },
          mid: '2',
          time: '2000',
          to: { source: 0, uid: '1', name: 'Me' },
          type: 1,
        },
        {
          body: {
            templateId: 1,
            text: '第一条',
            type: 1,
          },
          cmid: '1',
          from: { source: 0, uid: '2', name: 'Boss' },
          mid: '1',
          time: '1000',
          to: { source: 0, uid: '1', name: 'Me' },
          type: 1,
        },
      ],
      type: 1,
    })

    socket.dispatchEvent(
      new MessageEvent('message', {
        data: mqtt.encode({
          messageId: 1,
          payload: protocol,
        }),
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    const history = useChat().getChatHistory('uid:2')
    expect(history.items.map((item) => item.content)).toEqual(['第一条', '第二条'])
  })

  it('deduplicates repeated messages and captures outbound wrapper sends', async () => {
    const sentPayload = encodeProtocol({
      messages: [
        {
          body: {
            templateId: 1,
            text: '你好 Boss',
            type: 1,
          },
          cmid: '3',
          from: { source: 0, uid: '1', name: 'Me' },
          mid: '3',
          time: '3000',
          to: { source: 0, uid: '2', name: 'Boss' },
          type: 1,
        },
      ],
      type: 1,
    })

    const originalSend = WebSocket.prototype.send
    const sendSpy = vi.fn()

    try {
      WebSocket.prototype.send = function (
        this: WebSocket,
        data: string | ArrayBufferLike | Blob | ArrayBufferView,
      ) {
        sendSpy(data)
      }

      const socket = new WebSocket('ws://localhost:1234')
      window.socket = socket

      initBossChatStream()
      socket.send(sentPayload)
      socket.send(sentPayload)

      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      WebSocket.prototype.send = originalSend
    }

    const conversations = useChat().listChatConversations(10)
    expect(conversations.total).toBe(1)
    expect(conversations.items[0].latestMessage).toBe('你好 Boss')

    const history = useChat().getChatHistory('uid:2')
    expect(history.total).toBe(1)
  })

  it('does not monkey patch unrelated websocket instances outside window.socket', async () => {
    const payload = encodeProtocol({
      messages: [
        {
          body: {
            templateId: 1,
            text: '不应被采集',
            type: 1,
          },
          cmid: '9',
          from: { source: 0, uid: '1', name: 'Me' },
          mid: '9',
          time: '9000',
          to: { source: 0, uid: '3', name: 'Other' },
          type: 1,
        },
      ],
      type: 1,
    })

    const originalSend = WebSocket.prototype.send
    const sendSpy = vi.fn()

    try {
      WebSocket.prototype.send = function (
        this: WebSocket,
        data: string | ArrayBufferLike | Blob | ArrayBufferView,
      ) {
        sendSpy(data)
      }

      window.socket = new WebSocket('ws://localhost:1234')
      initBossChatStream()

      const unrelatedSocket = new WebSocket('ws://localhost:4321')
      unrelatedSocket.send(payload)

      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      WebSocket.prototype.send = originalSend
    }

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(useChat().listChatConversations(10).total).toBe(0)
  })
})
