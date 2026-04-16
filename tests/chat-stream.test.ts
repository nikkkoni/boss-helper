// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChat } from '@/composables/useChat'
import { encodeChatProtocol } from '@/composables/useWebSocket/handler'
import { mqtt } from '@/composables/useWebSocket/mqtt'
import type { TechwolfChatProtocol } from '@/composables/useWebSocket/type'
import { initBossChatStream } from '@/pages/zhipin/hooks/useChatStream'
import { logger } from '@/utils/logger'

function encodeProtocol(payload: Record<string, unknown>) {
  return encodeChatProtocol(payload as unknown as TechwolfChatProtocol)
}

describe('initBossChatStream', () => {
  beforeEach(() => {
    useChat().chatMessages.value = []
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

    const socket = new WebSocket('ws://localhost:1234')
    const sendSpy = vi.spyOn(socket, 'send').mockImplementation(() => undefined)
    window.socket = socket

    initBossChatStream()
    socket.send(sentPayload)
    socket.send(sentPayload)

    await new Promise((resolve) => setTimeout(resolve, 0))

    const conversations = useChat().listChatConversations({ limit: 10 })
    expect(conversations.total).toBe(1)
    expect(conversations.items[0].latestMessage).toBe('你好 Boss')
    expect(conversations.items[0].latestRole).toBe('user')
    expect(conversations.items[0].needsReply).toBe(false)
    expect(sendSpy).toHaveBeenCalledTimes(2)

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

    window.socket = new WebSocket('ws://localhost:1234')
    initBossChatStream()

    const unrelatedSocket = new WebSocket('ws://localhost:4321')
    const sendSpy = vi.spyOn(unrelatedSocket, 'send').mockImplementation(() => undefined)
    unrelatedSocket.send(payload)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(useChat().listChatConversations({ limit: 10 }).total).toBe(0)
  })

  it('captures wrapper sends, parses alternate message bodies, and tolerates undecodable frames', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined)
    const wrapperSend = vi.fn(() => undefined)
    const clientError = new Error('client unavailable')
    const chatWebsocket = {
      send: wrapperSend,
    } as { send: (payload: unknown) => void }

    window.ChatWebsocket = chatWebsocket
    window.GeekChatCore = {
      getInstance() {
        throw clientError
      },
    } as never
    window.__bossHelperChatStreamInitialized = undefined

    initBossChatStream()
    chatWebsocket.send(
      encodeProtocol({
        messages: [
          {
            body: { headTitle: '标题消息', type: 1 },
            from: { source: 0, uid: '2', name: 'Boss' },
            mid: '11',
            time: '11000',
            to: { source: 0, uid: '1', name: 'Me' },
            type: 1,
          },
          {
            body: { image: { url: 'https://example.com/a.png' }, type: 1 },
            from: { source: 0, uid: '2', name: 'Boss' },
            mid: '12',
            time: '12000',
            to: { source: 0, uid: '1', name: 'Me' },
            type: 1,
          },
          {
            body: { text: '我发出的消息', type: 1 },
            from: { source: 0, uid: '1', name: 'Me' },
            mid: '13',
            time: '13000',
            to: { source: 0, uid: '2', name: 'Boss' },
            type: 1,
          },
        ],
        type: 1,
      }),
    )
    chatWebsocket.send(new Uint8Array([255, 0, 1]) as unknown as { toArrayBuffer: () => ArrayBuffer })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(wrapperSend).toHaveBeenCalledTimes(2)
    expect(useChat().getChatHistory('uid:2').items.map((item) => item.content)).toEqual([
      '标题消息',
      '[图片]',
      '我发出的消息',
    ])
    expect(debugSpy).toHaveBeenCalledWith('初始化聊天发送 hook 失败', clientError)
  })
})
