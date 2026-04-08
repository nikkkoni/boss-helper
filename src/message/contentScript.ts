import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import { defineProxy } from 'comctx'

import type { StorageItemKey } from '#imports'
import { browser, storage } from '#imports'

import {
  BOSS_HELPER_AGENT_BRIDGE_REQUEST,
  BOSS_HELPER_AGENT_EVENT_FORWARD,
  BOSS_HELPER_AGENT_VERSION,
  createBossHelperAgentResponse,
  isBossHelperAgentEventBridgeMessage,
  isBossHelperAgentBridgeResponse,
  isBossHelperAgentRequest,
  type BossHelperAgentCommand,
  type BossHelperAgentBridgeRequest,
  type BossHelperAgentRequest,
  type BossHelperAgentResponse,
} from '@/message/agent'

import type { BackgroundCounter } from './background'

export const [, injectBackgroundCounter] = defineProxy(() => ({}) as BackgroundCounter, {
  namespace: '__boss-helper-background__',
})

function genKey(key: string): StorageItemKey {
  const prefixes = ['local:', 'session:', 'sync:', 'managed:'] as const
  return prefixes.some((prefix) => key.startsWith(prefix)) ? (key as StorageItemKey) : `sync:${key}`
}

export class ContentCounter implements BackgroundCounter {
  public background: BackgroundCounter
  constructor(background: BackgroundCounter) {
    this.background = background
  }

  async cookieInfo(...args: Parameters<BackgroundCounter['cookieInfo']>) {
    return this.background.cookieInfo(...args)
  }

  async cookieSwitch(...args: Parameters<BackgroundCounter['cookieSwitch']>) {
    return this.background.cookieSwitch(...args)
  }

  async cookieSave(...args: Parameters<BackgroundCounter['cookieSave']>) {
    return this.background.cookieSave(...args)
  }

  async cookieDelete(...args: Parameters<BackgroundCounter['cookieDelete']>) {
    return this.background.cookieDelete(...args)
  }

  async cookieClear(...args: Parameters<BackgroundCounter['cookieClear']>) {
    return this.background.cookieClear(...args)
  }

  async request(...args: Parameters<BackgroundCounter['request']>) {
    return this.background.request(...args)
  }

  async notify(...args: Parameters<BackgroundCounter['notify']>) {
    return this.background.notify(...args)
  }

  async backgroundTest(...args: Parameters<BackgroundCounter['backgroundTest']>) {
    return this.background.backgroundTest(...args)
  }

  async storageGet<T>(key: string, defaultValue: T): Promise<T>
  async storageGet<T>(key: string): Promise<T | null>
  async storageGet<T>(key: string, defaultValue?: T): Promise<T | null> {
    return storage.getItem<T>(genKey(key), { fallback: defaultValue })
  }

  async storageSet<T>(key: string, value: T) {
    await storage.setItem(genKey(key), value)
    return true
  }

  async storageRm(key: string) {
    await storage.removeItem(genKey(key))
    return true
  }

  async contentScriptTest(type: 'success' | 'error') {
    if (type === 'error') {
      throw new Error(`test error date: ${Date.now()}`)
    }
    return Date.now()
  }
}

interface MessageMeta {
  url: string
}

export class InjectBackgroundAdapter implements Adapter<MessageMeta> {
  sendMessage: SendMessage<MessageMeta> = async (message) => {
    return browser.runtime.sendMessage(browser.runtime.id, {
      ...message,
      meta: { url: document.location.href },
    })
  }

  onMessage: OnMessage<MessageMeta> = (callback) => {
    const handler = (message?: Partial<Message<MessageMeta>>) => {
      callback(message)
    }
    browser.runtime.onMessage.addListener(handler)
    return () => browser.runtime.onMessage.removeListener(handler)
  }
}

export const [provideContentCounter] = defineProxy(
  () => new ContentCounter(injectBackgroundCounter(new InjectBackgroundAdapter())),
  {
    namespace: '__boss-helper-content__',
  },
)

export class ProvideContentAdapter implements Adapter {
  sendMessage: SendMessage = (message) => {
    window.parent.postMessage(message, '*')
  }

  onMessage: OnMessage = (callback) => {
    const handler = (event: MessageEvent<Partial<Message<Record<string, any>>> | undefined>) =>
      callback(event.data)
    window.parent.addEventListener('message', handler)
    return () => window.parent.removeEventListener('message', handler)
  }
}

async function forwardAgentRequestToPage(
  request: BossHelperAgentRequest,
): Promise<BossHelperAgentResponse> {
  const requestId = request.requestId ?? crypto.randomUUID()

  return new Promise((resolve) => {
    const handleResponse = (event: MessageEvent) => {
      if (event.source !== window || !isBossHelperAgentBridgeResponse(event.data)) {
        return
      }
      if (event.data.requestId !== requestId) {
        return
      }

      cleanup()
      resolve(event.data.payload)
    }

    const timeout = window.setTimeout(() => {
      cleanup()
      resolve(
        createBossHelperAgentResponse(
          false,
          'page-timeout',
          '投递页面未响应，请确认 Boss 页面已完成初始化',
        ),
      )
    }, getCommandTimeout(request.command))

    const cleanup = () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', handleResponse)
    }

    const payload: BossHelperAgentBridgeRequest = {
      type: BOSS_HELPER_AGENT_BRIDGE_REQUEST,
      requestId,
      payload: {
        ...request,
        requestId,
        version: request.version ?? BOSS_HELPER_AGENT_VERSION,
      },
    }

    window.addEventListener('message', handleResponse)
    window.postMessage(payload, '*')
  })
}

function getCommandTimeout(command: BossHelperAgentCommand) {
  switch (command) {
    case 'start':
    case 'jobs.list':
    case 'navigate':
    case 'chat.list':
    case 'chat.history':
    case 'chat.send':
    case 'resume.get':
      return 10_000
    case 'stop':
    case 'jobs.detail':
      return 65_000
    default:
      return 5_000
  }
}

function handleRuntimeAgentRequest(message: unknown) {
  if (!isBossHelperAgentRequest(message)) {
    return undefined
  }

  return forwardAgentRequestToPage(message).catch((error) =>
    createBossHelperAgentResponse(
      false,
      'page-bridge-error',
      error instanceof Error ? error.message : '投递页面未响应，请确认 Boss 页面已完成初始化',
    ),
  )
}

export function registerAgentMessageBridge() {
  const forwardPageEventToBackground = (event: MessageEvent) => {
    if (event.source !== window || !isBossHelperAgentEventBridgeMessage(event.data)) {
      return
    }

    void browser.runtime.sendMessage({
      type: BOSS_HELPER_AGENT_EVENT_FORWARD,
      payload: event.data.payload,
    })
  }

  window.addEventListener('message', forwardPageEventToBackground)

  if (globalThis.chrome?.runtime?.onMessage) {
    globalThis.chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const responsePromise = handleRuntimeAgentRequest(message)
      if (!responsePromise) {
        return undefined
      }

      void responsePromise.then(sendResponse)
      return true
    })
    return
  }

  browser.runtime.onMessage.addListener((message) => {
    return handleRuntimeAgentRequest(message)
  })
}
