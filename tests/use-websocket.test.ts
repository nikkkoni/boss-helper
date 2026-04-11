// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
    group: vi.fn(),
    groupEnd: vi.fn(),
  },
}))

describe('websocket protobuf and mqtt helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    mockLoggerError.mockReset()
  })

  it('encodes messages and chooses GeekChatCore first when sending', async () => {
    const clientSend = vi.fn()
    window.GeekChatCore = {
      getInstance: () => ({
        getClient: () => ({
          client: {
            send: clientSend,
          },
        }),
      }),
    }

    const { Message } = await import('@/composables/useWebSocket/protobuf')
    const realDateNow = Date.now
    vi.spyOn(Date, 'now').mockImplementation(() => 1_700_000_000_000)
    const message = new Message({
      content: '你好',
      form_uid: '1',
      to_name: 'encryptBoss',
      to_uid: '2',
    })
    const duplicateTimestampMessage = new Message({
      content: '再来一条',
      form_uid: '1',
      to_name: 'encryptBoss',
      to_uid: '2',
    })

    expect(message.hex).toMatch(/^[0-9a-f]+$/)
    expect(message.toArrayBuffer().byteLength).toBeGreaterThan(0)
    expect(message.msg).not.toEqual(duplicateTimestampMessage.msg)

    message.send()

    expect(clientSend).toHaveBeenCalledWith(message)
    Date.now = realDateNow
  })

  it('falls back to ChatWebsocket when GeekChatCore is missing', async () => {
    delete window.GeekChatCore
    const socketSend = vi.fn()
    window.ChatWebsocket = {
      send: socketSend,
    }

    const { Message } = await import('@/composables/useWebSocket/protobuf')
    const message = new Message({
      content: 'hello',
      form_uid: '1',
      to_name: 'encryptBoss',
      to_uid: '2',
    })

    message.send()

    expect(socketSend).toHaveBeenCalledWith(message)
  })

  it('shows an error when no send channel is available', async () => {
    delete window.GeekChatCore
    delete window.ChatWebsocket

    const { ElMessage } = await import('element-plus')
    const { Message } = await import('@/composables/useWebSocket/protobuf')
    const message = new Message({
      content: 'hello',
      form_uid: '1',
      to_name: 'encryptBoss',
      to_uid: '2',
    })

    message.send()

    expect(ElMessage.error).toHaveBeenCalledWith('无可用发送渠道，请等待作者修复。可暂时关闭招呼语功能')
  })

  it('builds chat protocol payloads for text and image messages', async () => {
    const { default: ChatProtobufHandler } = await import('@/composables/useWebSocket/handler')
    const handler = new ChatProtobufHandler()

    handler.build = {
      body: { create: vi.fn(() => ({})) },
      chatProtocol: { create: vi.fn(() => ({})) },
      message: { create: vi.fn(() => ({})) },
      user: { create: vi.fn(() => ({})) },
    }

    const text = handler.createTextMessage({
      tempID: 11,
      isSelf: true,
      from: { avatar: '', name: 'Alice', source: 0, uid: 1, encryptUid: 'from-encrypt' },
      to: { encryptUid: 'to-encrypt', source: 0, uid: 2 },
      time: Date.now(),
      body: { text: 'hello', type: 1 },
      mSource: 'web',
      type: 1,
      typeSource: 'text',
    })

    expect(text).toEqual(
      expect.objectContaining({
        type: 1,
        messages: [
          expect.objectContaining({
            body: expect.objectContaining({ text: 'hello', type: 1, templateId: 1 }),
            cmid: 11,
            mid: 11,
            type: 1,
          }),
        ],
      }),
    )

    const image = handler.createImageMessage({
      tempID: 12,
      isSelf: true,
      from: { avatar: '', name: 'Alice', source: 0, uid: 1, encryptUid: 'from-encrypt' },
      to: { encryptUid: 'to-encrypt', source: 0, uid: 2 },
      time: Date.now(),
      body: {
        image: {
          originImage: { height: 20, url: 'https://example.com/a.png', width: 10 },
          tinyImage: { height: 10, url: 'https://example.com/b.png', width: 5 },
        },
        templateId: 1,
        type: 3,
      },
      mSource: 'web',
      type: 1,
      typeSource: 'image',
    })

    expect(image.messages[0]?.body?.image).toEqual(
      expect.objectContaining({
        originImage: expect.objectContaining({ width: 10 }),
      }),
    )
  })

  it('initializes protobuf handlers from the raw proto string', async () => {
    const { default: ChatProtobufHandler } = await import('@/composables/useWebSocket/handler')
    const handler = new ChatProtobufHandler()

    await handler.init()

    expect(handler.chatProto).toBeTruthy()
    expect(handler.build.chatProtocol).toBeTruthy()
    expect(handler.build.message).toBeTruthy()
  })

  it('round-trips protobuf image payloads with originImage metadata', async () => {
    const { AwesomeMessage } = await import('@/composables/useWebSocket/type')

    const payload = {
      messages: [
        {
          body: {
            image: {
              originImage: {
                height: 20,
                url: 'https://example.com/origin.png',
                width: 10,
              },
              tinyImage: {
                height: 10,
                url: 'https://example.com/tiny.png',
                width: 5,
              },
            },
            templateId: 1,
            type: 3,
          },
          from: { uid: '1' },
          to: { uid: '2' },
        },
      ],
      type: 1,
    }

    const encoded = AwesomeMessage.encode(AwesomeMessage.create(payload)).finish()
    const decoded = AwesomeMessage.toObject(AwesomeMessage.decode(encoded), {
      defaults: false,
      longs: String,
    }) as {
      messages?: Array<{
        body?: {
          image?: {
            originImage?: { height?: number; url?: string; width?: number }
          }
        }
      }>
    }

    expect(decoded.messages?.[0]?.body?.image?.originImage).toEqual({
      height: 20,
      url: 'https://example.com/origin.png',
      width: 10,
    })
  })

  it('round-trips mqtt packets and decodes message ids', async () => {
    const { decodeLength, decodeUTF8String, mqtt, parseMessageId } = await import(
      '@/composables/useWebSocket/mqtt'
    )

    const packet = mqtt.encode({
      messageId: 42,
      payload: new Uint8Array([1, 2, 3, 4]),
    })
    const decoded = mqtt.decode(packet, packet[0] & 0x0f)
    const topic = decodeUTF8String(packet, 2, new TextDecoder())

    expect(decoded.topic).toBe('chat')
    expect(decoded.messageId).toBe(42)
    expect([...decoded.payload]).toEqual([1, 2, 3, 4])
    expect(topic?.value).toBe('chat')
    expect(parseMessageId(packet, 8)).toBe(42)
    expect(decodeLength(packet, 1).length).toBe(packet.length - 2)
  })

  it('covers mqtt decode edge cases and malformed packets', async () => {
    const { decodeLength, decodeUTF8String, decodeUint8Array, encodeLength, encodeUTF8String, mqtt, parseMessageId } =
      await import('@/composables/useWebSocket/mqtt')

    expect(encodeLength(321)).toEqual([193, 2])
    expect(encodeUTF8String('chat', new TextEncoder()).slice(0, 2)).toEqual([0, 4])
    expect(decodeUTF8String(Uint8Array.from([0]), 0, new TextDecoder())).toBeUndefined()
    expect(decodeUint8Array(Uint8Array.from([0]), 1)).toBeUndefined()
    expect(() => parseMessageId(Uint8Array.from([0]), 0)).toThrow('Cannot parse messageId')
    expect(() => decodeLength(Uint8Array.from([255, 255, 255, 255, 1]), 0)).toThrow('malformed length')
    expect(() => mqtt.decode(Uint8Array.from([0x33, 0x00, 0x00]), 3)).toThrow('Cannot parse topic')

    const qosPacket = Uint8Array.from([0x33, 0x06, 0x00, 0x04, 99, 104, 97, 116])
    const decoded = mqtt.decode(qosPacket, 3)

    expect(decoded.messageId).toBe(0)
    expect(mockLoggerError).toHaveBeenCalledWith('错的id?: ', expect.objectContaining({ topic: 'chat' }))
  })

  it('exports handler and message to window on index import', async () => {
    delete window._q_ChatProtobufHandler
    delete window._q_ChatProtobufMessage

    await import('@/composables/useWebSocket')

    expect(window._q_ChatProtobufHandler).toBeTruthy()
    expect(window._q_ChatProtobufMessage).toBeTruthy()
  })
})
