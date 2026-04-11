import { useChat, type ChatMessage } from '@/composables/useChat'
import { decodeChatProtocolToObject } from '@/composables/useWebSocket/handler'
import { mqtt } from '@/composables/useWebSocket/mqtt'
import {
  type TechwolfChatProtocol,
  type TechwolfMessage,
  type TechwolfMessageBody,
} from '@/composables/useWebSocket/type'
import { getCurDay, getCurTime } from '@/utils'

function getSelfUserId() {
  const userId = window._PAGE?.uid ?? window._PAGE?.userId
  return userId == null ? '' : String(userId)
}

function getMessageTimestamp(time?: string | number) {
  const parsed = Number(time)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now()
}

function getConversationId(message: TechwolfMessage) {
  const selfUserId = getSelfUserId()
  const fromUid = message.from?.uid == null ? '' : String(message.from.uid)
  const other = fromUid === selfUserId ? message.to : message.from
  const otherUid = other?.uid == null ? '' : String(other.uid)
  const otherName = other?.name?.trim()

  if (otherUid) {
    return `uid:${otherUid}`
  }

  return `name:${otherName || 'unknown'}`
}

function getMessageRole(message: TechwolfMessage): ChatMessage['role'] {
  const selfUserId = getSelfUserId()
  const fromUid = message.from?.uid == null ? '' : String(message.from.uid)
  return fromUid === selfUserId ? 'user' : 'boss'
}

function getMessageName(message: TechwolfMessage) {
  const selfUserId = getSelfUserId()
  const fromUid = message.from?.uid == null ? '' : String(message.from.uid)
  const other = fromUid === selfUserId ? message.to : message.from
  return other?.name?.trim() || undefined
}

function extractMessageContent(body?: TechwolfMessageBody) {
  if (!body) {
    return ''
  }

  if (body.text?.trim()) {
    return body.text.trim()
  }
  if (body.headTitle?.trim()) {
    return body.headTitle.trim()
  }
  if (body.notify?.text?.trim()) {
    return body.notify.text.trim()
  }
  if (body.dialog?.text?.trim()) {
    return body.dialog.text.trim()
  }
  if (body.interview?.text?.trim()) {
    return body.interview.text.trim()
  }
  if (body.hyperLink?.text?.trim()) {
    return body.hyperLink.text.trim()
  }
  if (body.jobDesc?.title?.trim()) {
    return `[职位卡片] ${body.jobDesc.title.trim()}`
  }
  if (body.resume?.position?.trim()) {
    return `[简历卡片] ${body.resume.position.trim()}`
  }
  if (body.image) {
    return '[图片]'
  }
  if (body.sticker) {
    return '[表情]'
  }
  if (body.video) {
    return '[视频]'
  }
  if (body.sound) {
    return '[语音]'
  }

  return ''
}

function buildDedupeKey(message: TechwolfMessage, conversationId: string, content: string) {
  const fromUid = message.from?.uid == null ? '' : String(message.from.uid)
  const toUid = message.to?.uid == null ? '' : String(message.to.uid)

  return [
    conversationId,
    String(message.mid ?? ''),
    String(message.cmid ?? ''),
    String(message.time ?? ''),
    fromUid,
    toUid,
    String(message.body?.type ?? ''),
    content,
  ].join(':')
}

function toChatMessage(message: TechwolfMessage): ChatMessage | null {
  const content = extractMessageContent(message.body)
  if (!content) {
    return null
  }

  const conversationId = getConversationId(message)
  const createdAt = getMessageTimestamp(message.time)
  const date = new Date(createdAt)
  const messageId = Number(message.mid ?? message.cmid ?? createdAt)

  return {
    id: Number.isFinite(messageId) ? messageId : createdAt,
    role: getMessageRole(message),
    name: getMessageName(message),
    content,
    conversationId,
    createdAt,
    date: [getCurDay(date), getCurTime(date)],
    avatar: '',
    data: {
      from_uid: message.from?.uid == null ? undefined : String(message.from.uid),
      to_uid: message.to?.uid == null ? undefined : String(message.to.uid),
      mid: message.mid == null ? undefined : String(message.mid),
      cmid: message.cmid == null ? undefined : String(message.cmid),
      dedupeKey: buildDedupeKey(message, conversationId, content),
    },
  }
}

function parseProtocol(bytes: Uint8Array) {
  const tryDecode = (payload: Uint8Array): TechwolfChatProtocol | null => {
    try {
      return decodeChatProtocolToObject(payload, {
        longs: String,
      })
    } catch {
      return null
    }
  }

  if (bytes.length > 0 && (bytes[0] >> 4) === 3) {
    try {
      const packet = mqtt.decode(bytes, bytes[0] & 0x0f)
      if (packet.topic === 'chat' && packet.payload?.length) {
        const decoded = tryDecode(packet.payload)
        if (decoded) {
          return decoded
        }
      }
    } catch {
      // ignore non-chat websocket frames
    }
  }

  return tryDecode(bytes)
}

async function toUint8Array(data: unknown): Promise<Uint8Array | null> {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  if (data && typeof data === 'object' && 'toArrayBuffer' in data && typeof data.toArrayBuffer === 'function') {
    const arrayBuffer = data.toArrayBuffer()
    return toUint8Array(arrayBuffer)
  }

  return null
}

export async function captureChatPayload(data: unknown) {
  const bytes = await toUint8Array(data)
  if (!bytes?.length) {
    return
  }

  const protocol = parseProtocol(bytes)
  if (!protocol?.messages?.length) {
    return
  }

  const chat = useChat()
  for (const item of protocol.messages) {
    const chatMessage = toChatMessage(item)
    if (chatMessage) {
      chat.appendChatMessage(chatMessage)
    }
  }
}
