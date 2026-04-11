import { useChat } from '@/composables/useChat'
import { nextChatId } from '@/composables/useChatMessageId'
import type { logData } from '@/stores/log'
import { getCurDay, getCurTime } from '@/utils'

export function useChatPromptBridge() {
  const { chatMessages } = useChat()

  function chatBossMessage(ctx: logData, msg: string) {
    const d = new Date()
    chatMessages.value.push({
      id: nextChatId(d.getTime()),
      role: 'boss',
      content: msg,
      date: [getCurDay(d), getCurTime(d)],
      name: ctx.listData.brandName,
      avatar: ctx.listData.brandLogo,
    })
  }

  return {
    chatBossMessage,
  }
}
