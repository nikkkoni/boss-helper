// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { counter } from '@/message'
import { setupPinia } from './helpers/pinia'
import { __resetMessageMock } from './mocks/message'

const signedKeyMocks = vi.hoisted(() => {
  const client = {
    GET: vi.fn(),
    POST: vi.fn(),
    use: vi.fn(),
  }

  return {
    client,
    elMessageError: vi.fn(),
    elMessageSuccess: vi.fn(),
    elNotification: vi.fn(),
    elMessageBoxAlert: vi.fn(),
    userStore: {
      getUserId: vi.fn<() => string | null>(() => null),
      getUserResumeData: vi.fn(async () => ({})),
    },
    modelStore: {
      modelData: [] as Array<Record<string, unknown>>,
    },
  }
})

vi.mock('element-plus', () => ({
  ElMessage: {
    error: signedKeyMocks.elMessageError,
    success: signedKeyMocks.elMessageSuccess,
    info: vi.fn(),
  },
  ElMessageBox: {
    alert: signedKeyMocks.elMessageBoxAlert,
  },
  ElNotification: signedKeyMocks.elNotification,
}))

vi.mock('openapi-fetch', () => ({
  default: vi.fn(() => signedKeyMocks.client),
}))

vi.mock('@/stores/user', () => ({
  useUser: () => signedKeyMocks.userStore,
}))

vi.mock('@/composables/useModel', () => ({
  useModel: () => signedKeyMocks.modelStore,
}))

import { resolveSignedKeyBaseUrl } from '@/stores/signedKey'

async function loadSignedKeyModule() {
  return import('@/stores/signedKey')
}

describe('resolveSignedKeyBaseUrl', () => {
  it('uses localhost in development-like environments', () => {
    expect(resolveSignedKeyBaseUrl({ PROD: false, TEST: false, WXT_TEST: false })).toBe(
      'http://localhost:8002',
    )
  })

  it('uses the production endpoint in prod and test builds', () => {
    expect(resolveSignedKeyBaseUrl({ PROD: true, TEST: false, WXT_TEST: false })).toBe(
      'https://boss-helper.ocyss.icu',
    )
    expect(resolveSignedKeyBaseUrl({ PROD: false, TEST: true, WXT_TEST: false })).toBe(
      'https://boss-helper.ocyss.icu',
    )
    expect(resolveSignedKeyBaseUrl({ PROD: false, TEST: false, WXT_TEST: true })).toBe(
      'https://boss-helper.ocyss.icu',
    )
  })
})

describe('signedKeyReqHandler', () => {
  beforeEach(() => {
    signedKeyMocks.elMessageError.mockReset()
  })

  it('normalizes Error, Response, object, and string errors', async () => {
    const { signedKeyReqHandler } = await loadSignedKeyModule()

    expect(signedKeyReqHandler({ error: new Error('network down') })).toBe('network down')
    expect(
      signedKeyReqHandler({ error: new Response(null, { status: 500, statusText: 'Server Error' }) }),
    ).toBe('Server Error')
    expect(signedKeyReqHandler({ error: { detail: { reason: 'denied' } } })).toBe(
      '{"reason":"denied"}',
    )
    expect(signedKeyReqHandler({ error: 'plain text error' })).toBe('plain text error')

    expect(signedKeyMocks.elMessageError).toHaveBeenNthCalledWith(1, 'network down')
    expect(signedKeyMocks.elMessageError).toHaveBeenNthCalledWith(2, 'Server Error')
    expect(signedKeyMocks.elMessageError).toHaveBeenNthCalledWith(3, '{"reason":"denied"}')
    expect(signedKeyMocks.elMessageError).toHaveBeenNthCalledWith(4, 'plain text error')
  })
})

describe('useSignedKey store', () => {
  beforeEach(() => {
    setupPinia()
    __resetMessageMock()
    signedKeyMocks.client.GET.mockReset()
    signedKeyMocks.client.POST.mockReset()
    signedKeyMocks.client.use.mockReset()
    signedKeyMocks.elMessageError.mockReset()
    signedKeyMocks.elMessageSuccess.mockReset()
    signedKeyMocks.elNotification.mockReset()
    signedKeyMocks.elMessageBoxAlert.mockReset()
    signedKeyMocks.userStore.getUserId.mockReset()
    signedKeyMocks.userStore.getUserResumeData.mockReset()
    signedKeyMocks.userStore.getUserId.mockReturnValue(null)
    signedKeyMocks.userStore.getUserResumeData.mockResolvedValue({})
    signedKeyMocks.modelStore.modelData = []
    vi.restoreAllMocks()
  })

  it('migrates legacy signed key storage into session storage during init', async () => {
    const remoteInfo = { users: [{ user_id: 'user-1' }] }
    signedKeyMocks.userStore.getUserId.mockReturnValue('user-1')
    signedKeyMocks.client.GET.mockImplementation(async (path: string) => {
      if (path === '/config') {
        return { data: { notification: [] } }
      }
      if (path === '/v1/llm/model_list') {
        return { data: [] }
      }
      if (path === '/v1/key/info') {
        return { data: remoteInfo }
      }
      throw new Error(`Unexpected GET ${path}`)
    })

    await counter.storageSet('sync:signedKey', 'legacy-key')
    await counter.storageSet('sync:signedKeyInfo', { users: [{ user_id: 'legacy-user' }] })

    const { useSignedKey } = await loadSignedKeyModule()
    const store = useSignedKey()

    await store.initSignedKey()

    expect(await counter.storageGet('session:signedKey')).toBe('legacy-key')
    expect(await counter.storageGet('session:signedKeyInfo')).toEqual({
      users: [{ user_id: 'legacy-user' }],
    })
    expect(await counter.storageGet('sync:signedKey')).toBeNull()
    expect(await counter.storageGet('sync:signedKeyInfo')).toBeNull()
    expect(store.signedKey).toBe('legacy-key')
    expect(store.signedKeyBak).toBeNull()
    expect(store.signedKeyInfo).toEqual(remoteInfo)
  })

  it('restores session state and keeps mismatched keys as backup during init', async () => {
    const restoredInfo = { users: [{ user_id: 'user-9' }] }
    const remoteInfo = { users: [{ user_id: 'user-2' }] }
    signedKeyMocks.userStore.getUserId.mockReturnValue('user-2')
    signedKeyMocks.client.GET.mockImplementation(async (path: string) => {
      if (path === '/config') {
        return { data: { notification: [] } }
      }
      if (path === '/v1/llm/model_list') {
        return { data: [] }
      }
      if (path === '/v1/key/info') {
        return { data: remoteInfo }
      }
      throw new Error(`Unexpected GET ${path}`)
    })

    await counter.storageSet('session:signedKey', 'session-key')
    await counter.storageSet('session:signedKeyInfo', restoredInfo)

    const { useSignedKey } = await loadSignedKeyModule()
    const store = useSignedKey()

    await store.initSignedKey()

    expect(store.signedKey).toBe('session-key')
    expect(store.signedKeyBak).toBeNull()
    expect(store.signedKeyInfo).toEqual(remoteInfo)
  })

  it('refreshes remote config even without a token', async () => {
    signedKeyMocks.client.GET.mockImplementation(async (path: string) => {
      if (path === '/config') {
        return { data: { notification: [] } }
      }
      throw new Error(`Unexpected GET ${path}`)
    })

    const { useSignedKey } = await loadSignedKeyModule()
    const store = useSignedKey()

    await expect(store.refreshSignedKeyInfo()).resolves.toBe(false)
    expect(signedKeyMocks.client.GET).toHaveBeenCalledWith('/config')
  })

  it('dedupes remote model_list entries while refreshing signed key info', async () => {
    signedKeyMocks.modelStore.modelData = [{ key: 'shared', name: 'Shared model' }]
    signedKeyMocks.client.GET.mockImplementation(async (path: string) => {
      if (path === '/config') {
        return { data: { notification: [] } }
      }
      if (path === '/v1/llm/model_list') {
        return {
          data: [
            { key: 'shared', name: 'Shared model' },
            { key: 'remote', name: 'Remote model', color: '#fff' },
          ],
        }
      }
      if (path === '/v1/key/info') {
        return { data: { users: [] } }
      }
      throw new Error(`Unexpected GET ${path}`)
    })

    const { useSignedKey } = await loadSignedKeyModule()
    const store = useSignedKey()

    await expect(store.refreshSignedKeyInfo('token-1')).resolves.toBe(true)
    await Promise.resolve()

    expect(signedKeyMocks.client.GET).toHaveBeenCalledWith('/config')
    expect(signedKeyMocks.client.GET).toHaveBeenCalledWith('/v1/llm/model_list')
    expect(store.signedKeyInfo).toEqual({ users: [] })
    expect(signedKeyMocks.modelStore.modelData).toEqual([
      { key: 'shared', name: 'Shared model' },
      { key: 'remote', name: 'Remote model', color: '#fff' },
    ])
  })

  it('dedupes message notifications and persists open state', async () => {
    const { useSignedKey } = await loadSignedKeyModule()
    const store = useSignedKey()

    await store.netNotification(
      {
        key: 'notice-1',
        type: 'message',
        data: {
          title: 'Heads up',
          content: 'hello',
          duration: 12,
        },
      },
      1000,
    )
    await store.netNotification(
      {
        key: 'notice-1',
        type: 'message',
        data: {
          title: 'Heads up',
          content: 'hello',
          duration: 12,
        },
      },
      1000,
    )

    expect(signedKeyMocks.elMessageBoxAlert).toHaveBeenCalledTimes(1)

    const [, , alertOptions] = signedKeyMocks.elMessageBoxAlert.mock.calls[0]
    alertOptions.callback()

    expect(await counter.storageGet('local:netConf-notice-1')).toBe(13_000)
  })

  it('opens notification urls and persists close state', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { useSignedKey } = await loadSignedKeyModule()
    const store = useSignedKey()

    await store.netNotification(
      {
        key: 'notice-2',
        type: 'notification',
        data: {
          onClose: vi.fn(),
          title: 'Update',
          message: 'click me',
          url: 'https://example.com/docs',
          duration: 5,
        },
      },
      2000,
    )

    expect(signedKeyMocks.elNotification).toHaveBeenCalledTimes(1)

    const [notificationOptions] = signedKeyMocks.elNotification.mock.calls[0]
    notificationOptions.onClick()
    notificationOptions.onClose()

    expect(openSpy).toHaveBeenCalledWith('https://example.com/docs')
    expect(await counter.storageGet('local:netConf-notice-2')).toBe(7000)
  })
})
