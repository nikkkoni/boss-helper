import { ElMessage } from 'element-plus'

import { createMonotonicIdGenerator } from '@/utils/monotonicId'

import type { TechwolfChatProtocol } from './type'
import { encodeChatProtocol, getSharedChatProtobufHandler } from './handler'
import { mqtt } from './mqtt'

const nextWebSocketMessageId = createMonotonicIdGenerator()
const MID_OFFSET = 68_256_432_452_609
const DEFAULT_SEND_RETRY_DELAY_MS = 200
const DEFAULT_SEND_TIMEOUT_MS = 1_000

function toSendError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string' && error.trim()) {
    return new Error(error)
  }

  return new Error(fallback)
}

interface MessageArgs {
  form_uid: string
  to_uid: string
  to_name: string // encryptBossId  擦,boss的id不是岗位的
  content?: string
  image?: string // url
}

export class Message {
  msg: Uint8Array
  hex: string
  args: MessageArgs
  createdAt: number
  messageId: string

  constructor(args: MessageArgs) {
    this.args = args
    const createdAt = Date.now()
    // Boss 页面原生协议使用 time + 固定偏移生成 mid/cmid，这里保留该格式并保证同毫秒内单调递增。
    const messageId = nextWebSocketMessageId(createdAt + MID_OFFSET)
    this.createdAt = createdAt
    this.messageId = String(messageId)
    const data: TechwolfChatProtocol = {
      messages: [
        {
          from: {
            uid: args.form_uid,
            source: 0,
          },
          to: {
            uid: args.to_uid,
            name: args.to_name,
            source: 0,
          },
          type: 1,
          mid: this.messageId,
          time: String(this.createdAt),
          body: {
            type: 1,
            templateId: 1,
            text: args.content,
            // image: {},
          },
          cmid: this.messageId,
        },
      ],
      type: 1,
    }

    this.msg = encodeChatProtocol(data)
    this.hex = [...this.msg].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  toArrayBuffer(): ArrayBuffer {
    return this.msg.buffer.slice(0, this.msg.byteLength) as ArrayBuffer
  }

  private trySend() {
    let lastError: unknown

    try {
      const client = window.GeekChatCore?.getInstance?.()?.getClient?.()?.client
      if (client?.send) {
        client.send(this)
        return true
      }
    } catch (error) {
      // Fall back to ChatWebsocket when GeekChatCore exists but is not ready yet.
      lastError = error
    }

    if (window.ChatWebsocket?.send) {
      try {
        window.ChatWebsocket.send(this)
        return true
      } catch (error) {
        lastError = error
      }
    }

    if (window.socket instanceof WebSocket && window.socket.readyState === WebSocket.OPEN) {
      try {
        window.socket.send(
          mqtt.encode({
            messageId: Number(this.args.form_uid) || undefined,
            payload: this.msg,
          }),
        )
        return true
      } catch (error) {
        lastError = error
      }
    }

    if (lastError != null) {
      throw lastError
    }

    return false
  }

  private trySendEventBus() {
    const publish = window.EventBus?.publish
    if (typeof publish !== 'function') {
      return false
    }

    let syncError: Error | null = null

    try {
      // Boss 的 EventBus 发送本身是 fire-and-forget；历史实现也不等待回调。
      publish(
        'CHAT_SEND_TEXT',
        {
          uid: this.args.to_uid,
          encryptUid: this.args.to_name,
          message: this.args.content,
          msg: this.args.content,
        },
        () => undefined,
        (error: unknown) => {
          syncError ??= toSendError(error, 'EventBus 发送失败')
        },
      )
    } catch (error) {
      throw toSendError(error, 'EventBus 发送失败')
    }

    if (syncError) {
      throw syncError
    }

    return true
  }

  async send(options: { retryDelayMs?: number, timeoutMs?: number } = {}) {
    const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_SEND_RETRY_DELAY_MS)
    const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS)
    const deadline = Date.now() + timeoutMs
    let lastError: unknown
    let eventBusAttempted = false

    while (true) {
      try {
        if (this.trySend()) {
          return
        }
      } catch (error) {
        lastError = error
      }

      if (!eventBusAttempted && typeof window.EventBus?.publish === 'function') {
        eventBusAttempted = true
        try {
          if (this.trySendEventBus()) {
            return
          }
        } catch (error) {
          lastError = error
        }
      }

      if (Date.now() >= deadline || retryDelayMs <= 0) {
        break
      }

      const waitMs = Math.min(retryDelayMs, Math.max(deadline - Date.now(), 0))
      if (waitMs <= 0) {
        break
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }

    if (lastError instanceof Error) {
      ElMessage.error(lastError.message)
      throw lastError
    }

    const message = '无可用发送渠道，请等待作者修复。可暂时关闭招呼语功能'
    ElMessage.error(message)
    throw new Error(message)
  }
}

// Initialize the shared runtime eagerly so window globals can be used directly in page scripts.
void getSharedChatProtobufHandler().init()
