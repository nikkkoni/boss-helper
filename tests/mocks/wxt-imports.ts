import * as vue from 'vue'

type EventListener<TArgs extends any[]> = (...args: TArgs) => unknown

function cloneValue<T>(value: T): T {
  if (value == null) {
    return value
  }
  return structuredClone(value)
}

function createEventEmitter<TArgs extends any[]>() {
  const listeners = new Set<EventListener<TArgs>>()

  return {
    addListener(listener: EventListener<TArgs>) {
      listeners.add(listener)
    },
    removeListener(listener: EventListener<TArgs>) {
      listeners.delete(listener)
    },
    hasListener(listener: EventListener<TArgs>) {
      return listeners.has(listener)
    },
    async __emit(...args: TArgs) {
      let lastResult: unknown
      for (const listener of [...listeners]) {
        const result = await listener(...args)
        if (result !== undefined) {
          lastResult = result
        }
      }
      return lastResult
    },
    __clear() {
      listeners.clear()
    },
  }
}

type MockCookie = {
  domain?: string
  expirationDate?: number
  name: string
  path?: string
  url?: string
  value: string
}

type MockPortMessageListener = (message: unknown) => void
type MockPortDisconnectListener = () => void

const storageMap = new Map<string, unknown>()
const cookiesByHost = new Map<string, MockCookie[]>()

const runtimeOnMessage = createEventEmitter<[unknown]>()
const runtimeOnMessageExternal = createEventEmitter<[unknown, { url?: string | null }]>()
const runtimeOnConnectExternal = createEventEmitter<[MockPort]>()

function normalizeHost(url?: string, domain?: string) {
  if (domain) {
    return domain.replace(/^\./, '')
  }
  if (url) {
    return new URL(url).hostname
  }
  return 'localhost'
}

function getCookieBucket(host: string) {
  const key = host.toLowerCase()
  if (!cookiesByHost.has(key)) {
    cookiesByHost.set(key, [])
  }
  return cookiesByHost.get(key)!
}

export interface MockPort {
  disconnect: () => void
  name: string
  onDisconnect: {
    addListener: (listener: MockPortDisconnectListener) => void
    removeListener: (listener: MockPortDisconnectListener) => void
  }
  onMessage: {
    addListener: (listener: MockPortMessageListener) => void
    removeListener: (listener: MockPortMessageListener) => void
  }
  postMessage: (message: unknown) => void
  sender?: {
    url?: string | null
  }
  __emitDisconnect: () => void
  __emitMessage: (message: unknown) => void
  __messages: unknown[]
}

export function createMockPort(
  name = 'mock-port',
  sender: { url?: string | null } = { url: 'https://127.0.0.1/' },
): MockPort {
  const messageListeners = new Set<MockPortMessageListener>()
  const disconnectListeners = new Set<MockPortDisconnectListener>()
  const messages: unknown[] = []

  return {
    name,
    sender,
    postMessage(message: unknown) {
      messages.push(message)
    },
    disconnect() {
      for (const listener of [...disconnectListeners]) {
        listener()
      }
    },
    onMessage: {
      addListener(listener) {
        messageListeners.add(listener)
      },
      removeListener(listener) {
        messageListeners.delete(listener)
      },
    },
    onDisconnect: {
      addListener(listener) {
        disconnectListeners.add(listener)
      },
      removeListener(listener) {
        disconnectListeners.delete(listener)
      },
    },
    __emitDisconnect() {
      for (const listener of [...disconnectListeners]) {
        listener()
      }
    },
    __emitMessage(message: unknown) {
      for (const listener of [...messageListeners]) {
        listener(message)
      }
    },
    __messages: messages,
  }
}

export const browser = {
  cookies: {
    async get({ url, name }: { url: string; name: string }) {
      const host = normalizeHost(url)
      return cloneValue(getCookieBucket(host).find((cookie) => cookie.name === name) ?? null)
    },
    async getAll({ url }: { url: string }) {
      const host = normalizeHost(url)
      return cloneValue(getCookieBucket(host))
    },
    async remove({ url, name }: { url: string; name: string }) {
      const host = normalizeHost(url)
      const bucket = getCookieBucket(host)
      const index = bucket.findIndex((cookie) => cookie.name === name)
      if (index === -1) {
        return null
      }
      const [removed] = bucket.splice(index, 1)
      return cloneValue(removed)
    },
    async set(cookie: MockCookie) {
      const host = normalizeHost(cookie.url, cookie.domain)
      const bucket = getCookieBucket(host)
      const normalized = {
        path: '/',
        ...cookie,
      }
      const currentIndex = bucket.findIndex((item) => item.name === normalized.name)
      if (currentIndex >= 0) {
        bucket.splice(currentIndex, 1, normalized)
      } else {
        bucket.push(normalized)
      }
      return cloneValue(normalized)
    },
  },
  notifications: {
    async create() {
      return 'mock-notification-id'
    },
  },
  runtime: {
    id: 'test-extension-id',
    lastError: undefined as { message: string } | undefined,
    onConnectExternal: runtimeOnConnectExternal,
    onMessage: runtimeOnMessage,
    onMessageExternal: runtimeOnMessageExternal,
    async sendMessage(..._args: unknown[]): Promise<unknown> {
      return undefined
    },
  },
  tabs: {
    async query(..._args: unknown[]): Promise<Array<{ active?: boolean; id?: number; url?: string }>> {
      return []
    },
    async sendMessage(..._args: unknown[]): Promise<unknown> {
      return undefined
    },
  },
}

export const storage = {
  async getItem<T>(key: string, options?: { fallback?: T }) {
    if (!storageMap.has(key)) {
      return cloneValue(options?.fallback ?? null)
    }
    return cloneValue(storageMap.get(key) as T)
  },
  async removeItem(key: string) {
    storageMap.delete(key)
  },
  async setItem<T>(key: string, value: T) {
    storageMap.set(key, cloneValue(value))
  },
}

export function __resetWxtMockState() {
  storageMap.clear()
  cookiesByHost.clear()
  runtimeOnMessage.__clear()
  runtimeOnMessageExternal.__clear()
  runtimeOnConnectExternal.__clear()
  browser.runtime.lastError = undefined
  browser.runtime.sendMessage = async (..._args: unknown[]) => undefined
  browser.tabs.query = async (..._args: unknown[]) => []
  browser.tabs.sendMessage = async (..._args: unknown[]) => undefined
}

export function __setStorageItem<T>(key: string, value: T) {
  storageMap.set(key, cloneValue(value))
}

export function __getStorageItem<T>(key: string) {
  return cloneValue(storageMap.get(key) as T)
}

export function __setCookies(cookies: MockCookie[]) {
  cookiesByHost.clear()
  for (const cookie of cookies) {
    const host = normalizeHost(cookie.url, cookie.domain)
    getCookieBucket(host).push(cloneValue(cookie))
  }
}

export async function __emitRuntimeMessage(message: unknown) {
  return runtimeOnMessage.__emit(message)
}

export async function __emitRuntimeMessageExternal(
  message: unknown,
  sender: { url?: string | null } = { url: 'https://127.0.0.1/' },
) {
  return runtimeOnMessageExternal.__emit(message, sender)
}

export async function __emitRuntimeConnectExternal(port: MockPort) {
  return runtimeOnConnectExternal.__emit(port)
}

export function defineBackground<T>(config: T) {
  return config
}

export function defineContentScript<T>(config: T) {
  return config
}

export function defineUnlistedScript<T extends (...args: any[]) => any>(factory: T) {
  return factory
}

export async function injectScript(..._args: unknown[]) {
  return undefined
}

export type Browser = typeof browser
export type StorageItemKey = string

export * from 'vue'
export const { computed, onMounted, onUnmounted, reactive, ref, shallowRef, toRaw, watch } = vue
