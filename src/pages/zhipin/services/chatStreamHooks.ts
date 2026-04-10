import { logger } from '@/utils/logger'

import { captureChatPayload } from './chatStreamMessages'

const attachedSockets = new WeakSet<WebSocket>()
const patchedSendTargets = new WeakSet<object>()
const patchedSocketSends = new WeakSet<WebSocket>()

function attachSocket(socket: WebSocket) {
  if (attachedSockets.has(socket)) {
    return
  }

  attachedSockets.add(socket)
  socket.addEventListener('message', (event) => {
    void captureChatPayload(event.data)
  })
}

function patchSocketSend(socket: WebSocket) {
  if (patchedSocketSends.has(socket)) {
    attachSocket(socket)
    return true
  }

  const originalSend = socket.send.bind(socket)
  socket.send = ((data: Parameters<WebSocket['send']>[0]) => {
    attachSocket(socket)
    void captureChatPayload(data)
    return originalSend(data)
  }) as typeof socket.send
  patchedSocketSends.add(socket)
  attachSocket(socket)
  return true
}

function patchSendTarget(target: { send: (...args: any[]) => unknown }) {
  if (patchedSendTargets.has(target)) {
    return true
  }

  const originalSend = target.send.bind(target)
  target.send = (...args: any[]) => {
    const data = args[0]
    void captureChatPayload(data)
    return originalSend(...args)
  }
  patchedSendTargets.add(target)
  return true
}

function installWrapperHooks() {
  let patchedAny = false

  if (window.ChatWebsocket?.send) {
    patchedAny = patchSendTarget(window.ChatWebsocket) || patchedAny
  }

  try {
    const client = window.GeekChatCore?.getInstance?.().getClient?.().client
    if (client?.send) {
      patchedAny = patchSendTarget(client) || patchedAny
    }
  } catch (error) {
    logger.debug('初始化聊天发送 hook 失败', error)
  }

  return patchedAny
}

function installSocketHooks() {
  if (window.socket instanceof WebSocket) {
    patchSocketSend(window.socket)
  }
}

export function installBossChatStreamHooks() {
  installSocketHooks()
  installWrapperHooks()

  let attempts = 0
  const timer = window.setInterval(() => {
    attempts += 1
    installWrapperHooks()
    if (window.socket instanceof WebSocket) {
      patchSocketSend(window.socket)
    }
    if (attempts >= 30) {
      window.clearInterval(timer)
    }
  }, 1000)
}
