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
  latestRole: 'boss' | 'user' | 'assistant'
  latestTimestamp: string
  messageCount: number
  name?: string
  needsReply: boolean
  roles: Array<'boss' | 'user' | 'assistant'>
}

export interface BossHelperAgentChatListData {
  conversations: BossHelperAgentChatConversation[]
  pendingReplyCount: number
  total: number
  totalConversations: number
}

export interface BossHelperAgentChatHistoryData {
  conversationId: string
  items: BossHelperAgentChatMessage[]
  limit: number
  offset: number
  total: number
}
