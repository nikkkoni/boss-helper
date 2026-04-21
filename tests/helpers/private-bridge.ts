import { beforeEach } from 'vitest'

import {
  resetBossHelperPrivateBridgeForTest,
  setBossHelperWindowBridgeTargetForTest,
} from '@/message/window'

type Listener = EventListenerOrEventListenerObject

export function createPrivateBridgeTarget() {
  const listeners = new Map<string, Set<Listener>>()

  const add = (type: string, listener: Listener) => {
    const bucket = listeners.get(type) ?? new Set<Listener>()
    bucket.add(listener)
    listeners.set(type, bucket)
  }

  const remove = (type: string, listener: Listener) => {
    const bucket = listeners.get(type)
    bucket?.delete(listener)
    if (bucket && bucket.size === 0) {
      listeners.delete(type)
    }
  }

  const target: EventTarget = {
    addEventListener(type, listener) {
      if (!listener) {
        return
      }
      add(type, listener)
    },
    dispatchEvent(event) {
      const bucket = listeners.get(event.type)
      if (!bucket) {
        return true
      }
      for (const listener of bucket) {
        if (typeof listener === 'function') {
          listener(event)
        } else {
          listener.handleEvent(event)
        }
      }
      return true
    },
    removeEventListener(type, listener) {
      if (!listener) {
        return
      }
      remove(type, listener)
    },
  }

  return target
}

export function usePrivateBridgeTarget() {
  beforeEach(() => {
    resetBossHelperPrivateBridgeForTest()
    setBossHelperWindowBridgeTargetForTest(createPrivateBridgeTarget())
  })
}
