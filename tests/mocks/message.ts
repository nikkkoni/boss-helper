type CookieInfo = {
  avatar: string
  date: string
  flag: 'student' | 'staff'
  form?: Record<string, unknown>
  gender: 'man' | 'woman'
  remark: string
  statistics?: string
  uid: string
  user: string
}

const storageMap = new Map<string, unknown>()
const cookieMap = new Map<string, CookieInfo>()

type RequestHandler = (args: {
  data: RequestInit
  responseType: string
  timeout: number
  url: string
}) => Promise<unknown>

let requestHandler: RequestHandler | null = null

export const counter = {
  async backgroundTest(type: 'success' | 'error') {
    if (type === 'error') {
      throw new Error('background test error')
    }
    return Date.now()
  },
  async cookieClear() {
    cookieMap.clear()
    return true
  },
  async cookieDelete(uid: string) {
    cookieMap.delete(uid)
    return true
  },
  async cookieInfo() {
    return Object.fromEntries(cookieMap.entries())
  },
  async cookieSave(info: CookieInfo) {
    cookieMap.set(info.uid, structuredClone(info))
    return true
  },
  async cookieSwitch(uid: string) {
    return cookieMap.has(uid)
  },
  async notify() {
    return true
  },
  async request(args: { data: RequestInit; responseType: string; timeout: number; url: string }) {
    if (requestHandler) {
      return requestHandler(args)
    }
    return null
  },
  async storageGet<T>(key: string, defaultValue?: T): Promise<T | null> {
    if (!storageMap.has(key)) {
      return structuredClone(defaultValue ?? null)
    }
    return structuredClone(storageMap.get(key) as T)
  },
  async storageRm(key: string) {
    storageMap.delete(key)
    return true
  },
  async storageSet<T>(key: string, value: T) {
    storageMap.set(key, structuredClone(value))
    return true
  },
}

export const ExtStorage = {
  async getItem(key: string) {
    return counter.storageGet(key)
  },
  async removeItem(key: string) {
    await counter.storageRm(key)
  },
  async setItem(key: string, value: unknown) {
    await counter.storageSet(key, value)
  },
}

export function __resetMessageMock() {
  storageMap.clear()
  cookieMap.clear()
  requestHandler = null
}

export function __setStorageItem<T>(key: string, value: T) {
  storageMap.set(key, structuredClone(value))
}

export function __getStorageItem<T>(key: string) {
  return structuredClone(storageMap.get(key) as T)
}

export function __setCookieInfo(entries: CookieInfo[]) {
  cookieMap.clear()
  for (const entry of entries) {
    cookieMap.set(entry.uid, structuredClone(entry))
  }
}

export function __setRequestHandler(handler: RequestHandler | null) {
  requestHandler = handler
}

export type { CookieInfo }
