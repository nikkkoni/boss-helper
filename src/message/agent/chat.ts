export interface BossHelperAgentChatMessage {
  content: string
  conversationId: string
  id: number
  name?: string
  role: 'boss' | 'user' | 'assistant'
  timestamp: string
}

export interface BossHelperAgentChatConversation {
  conversationId: string
  latestMessage: string
  latestTimestamp: string
  messageCount: number
  name?: string
  roles: Array<'boss' | 'user' | 'assistant'>
}

export interface BossHelperAgentChatListData {
  conversations: BossHelperAgentChatConversation[]
  total: number
}

export interface BossHelperAgentChatHistoryData {
  conversationId: string
  items: BossHelperAgentChatMessage[]
  limit: number
  offset: number
  total: number
}
