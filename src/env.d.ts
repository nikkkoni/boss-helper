import type { BossHelperAgentController } from '@/message/agent'
import type { NetConf } from '@/stores/signedKey'

export {}

declare global {
  interface Window {
    socket: WebSocket
    ChatWebsocket?: {
      send: (e: { toArrayBuffer: () => ArrayBuffer }) => void
    }
    GeekChatCore?: {
      getInstance: () => {
        getClient: () => {
          client: {
            send: (e: { toArrayBuffer: () => ArrayBuffer }) => void
          }
        }
      }
    }
    EventBus?: {
      publish: (e: string, ...data: unknown[]) => void
      subscribe: (e: string, t: (...data: unknown[]) => void) => void
    }
    _PAGE: {
      isGeekChat: boolean
      // zp_token: string; 7.18 寄！
      userId: number
      identity: number
      encryptUserId: string
      name: string
      showName: string
      tinyAvatar: string
      largeAvatar: string
      token: string
      isHunter: boolean
      clientIP: string
      email: unknown
      phone: unknown
      brandName: unknown
      doubleIdentity: boolean
      recruit: boolean
      agentRecruit: boolean
      industryCostTag: number
      gender: number
      trueMan: boolean
      studentFlag: boolean
      completeDayStatus: boolean
      complete: boolean
      multiExpect: boolean
      uid: number
    }
    Cookie: {
      get: (key: string) => string
    }
    __bossHelperAgent?: BossHelperAgentController
    __q_openStore?: () => void
    __q_netConf?: () => NetConf | undefined
    __q_useConf?: unknown
    __q_jobList?: unknown
    __q_log?: unknown
    __q_useSignedKey?: unknown
    __q_useUser?: unknown
    __q_parseGptJson?: unknown
    _q_ChatProtobufHandler?: unknown
    _q_ChatProtobufMessage?: unknown
    [key: string]: any
  }

  const __APP_VERSION__: string
}
