import protobuf from 'protobufjs'

import chatProto from '@/assets/chat.proto?raw'

import type {
  TechwolfChatProtocol,
  TechwolfImage,
  TechwolfMessage,
  TechwolfMessageBody,
  TechwolfUser,
} from './type'

type ProtobufFactory = {
  create(properties?: Record<string, unknown>): unknown
}

type ChatProtobufBuild = {
  body: ProtobufFactory
  chatProtocol: ProtobufFactory
  clientInfo: ProtobufFactory
  iq: ProtobufFactory
  iqResponse: ProtobufFactory
  kvEntry: ProtobufFactory
  message: ProtobufFactory
  messageRead: ProtobufFactory
  messageSync: ProtobufFactory
  presence: ProtobufFactory
  user: ProtobufFactory
}

type ChatProtobufRuntime = {
  build: ChatProtobufBuild
  chatProto: protobuf.Root
}

interface TechwolfImageInfo {
  url: string
  width: number
  height: number
}

interface TechwolfWritableImage extends TechwolfImage {
  iid?: number | string
  tinyImage?: TechwolfImageInfo
  originImage?: TechwolfImageInfo
}

interface CreateTextMessageData {
  tempID: number
  isSelf: boolean
  from: {
    uid: number
    name: string
    avatar: string
    encryptUid?: string
    source?: number
  }
  to: {
    source: number
    uid: number
    encryptUid: string
  }
  time: number
  body: {
    type: number
    text: string
  }
  mSource: string
  typeSource: string
  type: number
}

interface CreateImageMessageData {
  tempID: number
  isSelf: boolean
  from: {
    uid: number
    name: string
    avatar: string
    encryptUid?: string
    source?: number
  }
  to: {
    source: number
    uid: number
    encryptUid: string
  }
  time: number
  body: {
    image: {
      originImage: {
        width: number
        height: number
        url: string
      }
      tinyImage: {
        width: number
        height: number
        url: string
      }
    }
    type: number
    templateId: number
  }
  mSource: string
  typeSource: string
  type: number
}

let sharedChatProtobufRuntime: ChatProtobufRuntime | undefined
let sharedChatProtobufHandler: ChatProtobufHandler | undefined

function createChatProtobufRuntime(): ChatProtobufRuntime {
  const chatProtoRoot = protobuf.parse(chatProto).root

  return {
    chatProto: chatProtoRoot,
    build: {
      chatProtocol: chatProtoRoot.lookupType('TechwolfChatProtocol'),
      message: chatProtoRoot.lookupType('TechwolfMessage'),
      messageSync: chatProtoRoot.lookupType('TechwolfMessageSync'),
      messageRead: chatProtoRoot.lookupType('TechwolfMessageRead'),
      presence: chatProtoRoot.lookupType('TechwolfPresence'),
      user: chatProtoRoot.lookupType('TechwolfUser'),
      body: chatProtoRoot.lookupType('TechwolfMessageBody'),
      clientInfo: chatProtoRoot.lookupType('TechwolfClientInfo'),
      kvEntry: chatProtoRoot.lookupType('TechwolfKVEntry'),
      iq: chatProtoRoot.lookupType('TechwolfIq'),
      iqResponse: chatProtoRoot.lookupType('TechwolfIqResponse'),
    },
  }
}

export function getSharedChatProtobufRuntime() {
  sharedChatProtobufRuntime ??= createChatProtobufRuntime()
  return sharedChatProtobufRuntime
}

export class ChatProtobufHandler {
  build: Partial<ChatProtobufBuild>
  chatProto?: protobuf.Root

  constructor() {
    this.build = {}
  }

  async init() {
    const runtime = getSharedChatProtobufRuntime()
    this.chatProto = runtime.chatProto
    this.build = runtime.build
    return this
  }

  getChatProtocolType() {
    if (!this.build.chatProtocol) {
      const runtime = getSharedChatProtobufRuntime()
      this.build = runtime.build
      this.chatProto = runtime.chatProto
    }
    return this.build.chatProtocol as protobuf.Type
  }

  createChatProtocol(type: number) {
    const protocol = this.build.chatProtocol?.create() as unknown as TechwolfChatProtocol
    protocol.type = type
    return protocol
  }

  createMessage(
    type: number,
    messageId: number,
    from: TechwolfUser,
    to: TechwolfUser,
    body: TechwolfMessageBody,
  ) {
    const message = this.build.message?.create() as unknown as TechwolfMessage
    message.type = type
    message.mid = messageId
    message.cmid = messageId
    message.from = from
    message.to = to
    message.body = body
    return message
  }

  createUser(uid: number, name?: string, source = 0): TechwolfUser {
    const user = this.build.user?.create() as unknown as TechwolfUser
    user.source = source
    user.uid = uid || 0
    if (uid && name) {
      user.name = name
    }
    return user
  }

  createBody(type: number, templateId = 1): TechwolfMessageBody {
    const body = this.build.body?.create() as unknown as TechwolfMessageBody
    body.type = type
    body.templateId = templateId
    return body
  }

  createTextMessage(data: CreateTextMessageData) {
    const from = this.createUser(data.from.uid, data.from.encryptUid, data.from.source)
    const to = this.createUser(data.to.uid, data.to.encryptUid, data.to.source)
    const body = this.createBody(1, 1)

    body.text = data.body.text

    const message = this.createMessage(data.type || 1, data.tempID, from, to, body)
    const protocol = this.createChatProtocol(1)
    protocol.messages = [message]

    return protocol
  }

  createImageMessage(data: CreateImageMessageData) {
    const from = this.createUser(data.from.uid, data.from.encryptUid, data.from.source)
    const to = this.createUser(data.to.uid, data.to.encryptUid, data.to.source)
    const body = this.createBody(3, 1)

    body.image = data.body.image as TechwolfWritableImage

    const message = this.createMessage(data.type || 1, data.tempID, from, to, body)
    const protocol = this.createChatProtocol(1)
    protocol.messages = [message]

    return protocol
  }
}

export function getSharedChatProtobufHandler() {
  if (!sharedChatProtobufHandler) {
    sharedChatProtobufHandler = new ChatProtobufHandler()
    void sharedChatProtobufHandler.init()
  }
  return sharedChatProtobufHandler
}

export function encodeChatProtocol(data: TechwolfChatProtocol) {
  return getSharedChatProtobufHandler().getChatProtocolType().encode(data).finish().slice()
}

export function decodeChatProtocol(data: Uint8Array | ArrayBufferLike) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return getSharedChatProtobufHandler().getChatProtocolType().decode(bytes)
}

export function decodeChatProtocolToObject(
  data: Uint8Array | ArrayBufferLike,
  options: protobuf.IConversionOptions = { longs: String },
) {
  return getSharedChatProtobufHandler().getChatProtocolType().toObject(
    decodeChatProtocol(data),
    options,
  ) as TechwolfChatProtocol
}
