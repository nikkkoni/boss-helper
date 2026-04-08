import { webcrypto } from 'node:crypto'

import { afterEach, beforeEach, vi } from 'vitest'

import { __resetMessageMock } from '../mocks/message'
import { __resetWxtMockState } from '../mocks/wxt-imports'

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  })
}

if (typeof globalThis.requestAnimationFrame !== 'function') {
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
  })
}

if (typeof globalThis.cancelAnimationFrame !== 'function') {
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: (handle: number) => clearTimeout(handle),
  })
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  })
}

if (typeof globalThis.DOMRect === 'undefined') {
  Object.defineProperty(globalThis, 'DOMRect', {
    configurable: true,
    value: class DOMRect {
      height: number
      width: number
      x: number
      y: number

      constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x
        this.y = y
        this.width = width
        this.height = height
      }

      static fromRect(rect: Partial<DOMRect> = {}) {
        return new DOMRect(rect.x ?? 0, rect.y ?? 0, rect.width ?? 0, rect.height ?? 0)
      }
    },
  })
}

Object.defineProperty(globalThis, '__APP_VERSION__', {
  configurable: true,
  value: '0.4.4-test',
})

Object.defineProperty(globalThis, '__BOSS_HELPER_AGENT_BRIDGE_TOKEN__', {
  configurable: true,
  value: 'boss-helper-test-bridge-token',
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  const ElMessage = Object.assign(vi.fn(), {
    closeAll: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  })
  const ElMessageBox = Object.assign(vi.fn(), {
    alert: vi.fn(),
    confirm: vi.fn(),
    prompt: vi.fn(),
  })

  return {
    ...actual,
    ElMessage,
    ElMessageBox,
    ElNotification: vi.fn(),
  }
})

beforeEach(() => {
  __resetMessageMock()
  __resetWxtMockState()
  vi.clearAllMocks()

  if ('document' in globalThis) {
    document.body.innerHTML = ''
  }

  if ('localStorage' in globalThis) {
    localStorage.clear()
  }
})

afterEach(() => {
  vi.unstubAllGlobals()

  if ('document' in globalThis) {
    document.body.innerHTML = ''
  }
})
