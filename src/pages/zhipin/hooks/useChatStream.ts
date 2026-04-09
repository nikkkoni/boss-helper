import { installBossChatStreamHooks } from '../services/chatStreamHooks'

const CHAT_STREAM_INIT_FLAG = '__bossHelperChatStreamInitialized'

export function initBossChatStream() {
  if (window[CHAT_STREAM_INIT_FLAG]) {
    return
  }

  window[CHAT_STREAM_INIT_FLAG] = true
  installBossChatStreamHooks()
}
