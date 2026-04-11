import { watchThrottled } from '@vueuse/core'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import type { Middleware } from 'openapi-fetch'
import createClient from 'openapi-fetch'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { ref, toRaw } from '#imports'
import type { modelData } from '@/composables/useModel'
import { useModel } from '@/composables/useModel'
import { counter } from '@/message'
import { useUser } from '@/stores/user'
import type { components, paths } from '@/types/openapi'
import { logger } from '@/utils/logger'
import { migrateStorageKeys } from '@/utils/storageMigration'

type SignedKeyInfo = components['schemas']['KeyInfo']
type SignedKeyResponseLike = { error?: unknown } | null | undefined
type ModelListEntry = components['schemas']['ModelListEntry']

export interface NetConf {
  version: string
  version_description?: string
  notification: (NotificationAlert | NotificationMessage | NotificationNotification)[]
  store?: Record<string, [string, string, string]>
  price_info?: {
    signedKey: number
    account: number
    update_time: string
  }
  feedback: string
}

export interface NotificationAlert {
  key: string
  type: 'alert'
  data: import('element-plus').AlertProps
}

export interface NotificationMessage {
  key: string
  type: 'message'
  data: { title?: string; content: string; duration?: number }
}

export interface NotificationNotification {
  key: string
  type: 'notification'
  data: import('element-plus').NotificationProps & {
    url?: string
    duration?: number
  }
}

type SignedKeyEnv = {
  PROD?: boolean
  TEST?: boolean
  WXT_TEST?: boolean
}

export function resolveSignedKeyBaseUrl(env: SignedKeyEnv = import.meta.env as SignedKeyEnv) {
  return env.PROD || env.TEST || env.WXT_TEST
    ? 'https://boss-helper.ocyss.icu'
    : 'http://localhost:8002'
}

function sdbmCode(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = char + (hash << 6) + (hash << 16) - hash
  }
  return hash.toString()
}

export function signedKeyReqHandler(
  data: SignedKeyResponseLike,
  message = true,
): string | undefined {
  // logger.debug('请求响应', data)
  const error = data?.error
  if (error != null) {
    let errMsg = '未知错误'
    if (error instanceof Error) {
      errMsg = error.message
    } else if (error instanceof Response) {
      errMsg = error.statusText
    } else if (typeof error === 'string') {
      errMsg = error
    } else if (error != null && typeof error === 'object') {
      if ('detail' in error) {
        errMsg = JSON.stringify(error.detail)
      } else if ('message' in error) {
        errMsg = JSON.stringify(error.message)
      }
    }
    if (message) {
      ElMessage.error(errMsg)
    }
    return errMsg
  }
}

function reportAsyncTaskFailure(action: string, error: unknown, message?: string) {
  logger.error(action, error)
  if (message) {
    ElMessage.error(message)
  }
}

export type Client = ReturnType<typeof createClient<paths>>
export const signedKeyBaseUrl = resolveSignedKeyBaseUrl()

export const useSignedKey = defineStore('signedKey', () => {
  const signedKey = ref<string | null>(null)
  const signedKeyBak = ref<string | null>(null)
  const signedKeyInfo = ref<SignedKeyInfo>()
  const signedKeyStorageKey = 'session:signedKey'
  const signedKeyInfoStorageKey = 'session:signedKeyInfo'
  const legacySignedKeyStorageKey = 'sync:signedKey'
  const legacySignedKeyInfoStorageKey = 'sync:signedKeyInfo'
  const signedKeyStorageMigrations = [
    { oldKey: legacySignedKeyStorageKey, newKey: signedKeyStorageKey },
    { oldKey: legacySignedKeyInfoStorageKey, newKey: signedKeyInfoStorageKey },
  ] as const
  const user = useUser()
  const netConf = ref<NetConf>()
  let modelListPromise: Promise<modelData[] | undefined> | null = null

  const netNotificationMap = new Map<string, boolean>()

  const client = createClient<paths>({ baseUrl: signedKeyBaseUrl })

  const authMiddleware: Middleware = {
    async onRequest({ request }) {
      if (request.headers.get('Authorization') == null) {
        request.headers.set('Authorization', `Bearer ${signedKey.value}`)
      }
      if (request.headers.get('BossHelperUserID') == null) {
        const uid = user.getUserId()
        if (uid != null) {
          request.headers.set('BossHelperUserID', uid.toString())
        }
      }
      return request
    },
  }

  client.use(authMiddleware)

  function persistTask<T>(promise: Promise<T>, action: string, message?: string) {
    void promise.catch((error) => {
      reportAsyncTaskFailure(action, error, message)
    })
  }

  function mergeRemoteModels(items: modelData[]) {
    const model = useModel()
    model.modelData = [
      ...model.modelData,
      ...items.filter((item) => !model.modelData.some((current) => current.key === item.key)),
    ]
  }

  function normalizeRemoteModel(item: ModelListEntry): modelData {
    return {
      key: item.key,
      name: item.name,
      ...(item.color ? { color: item.color } : {}),
      ...(item.data ? { data: item.data as unknown as modelData['data'] } : {}),
      ...(item.vip ? { vip: item.vip } : {}),
    }
  }

  async function refreshModelList() {
    if (modelListPromise) {
      return modelListPromise
    }

    modelListPromise = client
      .GET('/v1/llm/model_list')
      .then(({ data }) => {
        const items = Array.isArray(data)
          ? data.map((item) => normalizeRemoteModel(item as ModelListEntry))
          : []
        mergeRemoteModels(items)
        return items
      })
      .catch((error) => {
        reportAsyncTaskFailure('加载模型列表失败', error)
        return undefined
      })
      .finally(() => {
        modelListPromise = null
      })

    return modelListPromise
  }

  async function refreshNetConfig() {
    const { data } = await client.GET('/config')
    netConf.value = data as unknown as NetConf
    if (import.meta.env.DEV) {
      window.__q_netConf = () => netConf.value
    }

    const now = Date.now()
    const notifications: NetConf['notification'] = netConf.value?.notification ?? []
    await Promise.all(notifications.map(async (item) => netNotification(item, now)))
  }

  watch(signedKey, (v) => {
    if (v == null || v === '') {
      persistTask(counter.storageRm(signedKeyStorageKey), '删除密钥失败', '删除密钥失败')
      return
    }
    persistTask(counter.storageSet(signedKeyStorageKey, v), '保存密钥失败', '保存密钥失败')
  })

  watchThrottled(
    signedKeyInfo,
    (v) => {
      if (v == null) {
        persistTask(
          counter.storageRm(signedKeyInfoStorageKey),
          '删除密钥信息失败',
          '删除密钥信息失败',
        )
        return
      }
      persistTask(
        counter.storageSet(signedKeyInfoStorageKey, toRaw(v)),
        '保存密钥信息失败',
        '保存密钥信息失败',
      )
    },
    { throttle: 2000 },
  )

  async function netNotification(
    item: NotificationAlert | NotificationMessage | NotificationNotification,
    now: number = 0,
  ) {
    if (now !== 0 && now < (await counter.storageGet(`local:netConf-${item.key}`, 0))) {
      return
    }
    if (netNotificationMap.has(item.key)) {
      return
    }
    netNotificationMap.set(item.key, true)
    if (item.type === 'message') {
      void ElMessageBox.alert(item.data.content, item.data.title ?? 'message', {
        ...item.data,
        confirmButtonText: 'OK',
        callback: () => {
          persistTask(
            counter.storageSet(
              `local:netConf-${item.key}`,
              now + (item.data.duration ?? 86400) * 1000,
            ),
            '保存消息通知状态失败',
          )
        },
      })
    } else if (item.type === 'notification') {
      void ElNotification({
        ...item.data,
        duration: 0,
        onClose() {
          persistTask(
            counter.storageSet(
              `local:netConf-${item.key}`,
              now + (item.data.duration ?? 86400) * 1000,
            ),
            '保存通知状态失败',
          )
        },
        onClick() {
          if (item.data.url) {
            window.open(item.data.url)
          }
        },
      })
    }
  }

  async function getSignedKeyInfo(token?: string) {
    const headers: Record<string, string | undefined> = {
      Authorization: `Bearer ${token ?? signedKey.value}`,
    }
    if (token == null && signedKey.value == null) {
      delete headers.Authorization
    }

    const data = await client.GET('/v1/key/info', {
      headers,
    })
    signedKeyReqHandler(data)
    return data.data
  }

  async function refreshSignedKeyInfo(token?: string) {
    persistTask(refreshNetConfig(), '刷新远程配置失败')
    if (token == null && (signedKey.value == null || signedKey.value === '')) {
      return false
    }
    void refreshModelList()

    const data = await getSignedKeyInfo(token)
    signedKeyInfo.value = data
    return true
  }

  async function initSignedKey() {
    await migrateStorageKeys(signedKeyStorageMigrations, counter)
    const key = await counter.storageGet<string>(signedKeyStorageKey)
    if (key == null) {
      return
    }
    const info = await counter.storageGet<SignedKeyInfo>(signedKeyInfoStorageKey)
    if (info != null) {
      signedKeyInfo.value = info
    }

    if (await refreshSignedKeyInfo(key)) {
      const userId = user.getUserId()?.toString()
      const matchedUser = signedKeyInfo.value?.users.find((item) => item.user_id === userId)
      if (matchedUser == null) {
        signedKeyBak.value = key
      } else {
        signedKey.value = key
      }
    }
  }

  async function updateResume() {
    const resume = await user.getUserResumeData(true)
    const code = sdbmCode(JSON.stringify(resume))
    let resp = await client.POST('/v1/key/resume', {
      body: {
        code,
      },
    })
    let errMsg = signedKeyReqHandler(resp)
    if (errMsg != null) {
      return
    }
    resp = await client.POST('/v1/key/resume', {
      body: {
        code,
        data: resume,
      },
    })
    errMsg = signedKeyReqHandler(resp)
    if (errMsg == null) {
      ElMessage.success('更新简历成功')
    }
  }

  return {
    signedKey,
    signedKeyBak,
    client,
    netConf,
    signedKeyReqHandler,
    initSignedKey,
    sdbmCode,
    updateResume,
    getSignedKeyInfo,
    refreshSignedKeyInfo,
    signedKeyInfo,
    netNotification,
  }
})

if (import.meta.env.DEV) {
  window.__q_useSignedKey = useSignedKey
}
