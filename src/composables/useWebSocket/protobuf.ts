import { ElMessage } from 'element-plus'

import { createMonotonicIdGenerator } from '@/utils/monotonicId'

import type { TechwolfChatProtocol } from './type'
import { encodeChatProtocol, getSharedChatProtobufHandler } from './handler'

const nextWebSocketMessageId = createMonotonicIdGenerator()
const MID_OFFSET = 68_256_432_452_609

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

  constructor(args: MessageArgs) {
    this.args = args
    const createdAt = Date.now()
    // Boss 页面原生协议使用 time + 固定偏移生成 mid/cmid，这里保留该格式并保证同毫秒内单调递增。
    const messageId = nextWebSocketMessageId(createdAt + MID_OFFSET)
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
          mid: String(messageId),
          time: String(createdAt),
          body: {
            type: 1,
            templateId: 1,
            text: args.content,
            // image: {},
          },
          cmid: String(messageId),
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

  send() {
    if ('GeekChatCore' in window && window.GeekChatCore != null) {
      const client = window.GeekChatCore.getInstance().getClient().client
      client.send(this)
    } else if ('ChatWebsocket' in window && window.ChatWebsocket != null) {
      window.ChatWebsocket.send(this)
    } else {
      ElMessage.error('无可用发送渠道，请等待作者修复。可暂时关闭招呼语功能')
    }
  }
}

// Initialize the shared runtime eagerly so window globals can be used directly in page scripts.
void getSharedChatProtobufHandler().init()
