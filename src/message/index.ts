import type { StorageLikeAsync } from '@vueuse/core'
import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import { defineProxy } from 'comctx'

import type { ContentCounter } from './contentScript'
import {
  getBossHelperWindowBridgeTarget,
  onBossHelperWindowMessage,
  postBossHelperWindowMessage,
} from './window'

export type { CookieInfo } from './background'
// export type * from './background'
// export type * from './contentScript'

export const [, injectCounter] = defineProxy(() => ({}) as ContentCounter, {
  namespace: '__boss-helper-content__',
})

export default class InjectAdapter implements Adapter {
  sendMessage: SendMessage = (message) => {
    postBossHelperWindowMessage(getBossHelperWindowBridgeTarget(), {
      payload: message,
      source: 'main-world',
      type: 'comctx',
    })
  }

  onMessage: OnMessage = (callback) => {
    return onBossHelperWindowMessage(
      getBossHelperWindowBridgeTarget(),
      (payload, message) => {
        if (message.source === 'main-world') {
          return
        }
        callback(payload as Partial<Message<Record<string, any>>> | undefined)
      },
      { messageType: 'comctx' },
    )
  }
}

export const counter = injectCounter(new InjectAdapter())

export const ExtStorage: StorageLikeAsync = {
  async getItem(key) {
    return counter.storageGet(key)
  },
  async setItem(key, value) {
    await counter.storageSet(key, value)
  },
  async removeItem(key) {
    await counter.storageRm(key)
  },
}
