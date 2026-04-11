import { ChatProtobufHandler } from './handler'
import { Message } from './protobuf'

export * from './handler'
export * from './protobuf'

window._q_ChatProtobufHandler = ChatProtobufHandler
window._q_ChatProtobufMessage = Message
