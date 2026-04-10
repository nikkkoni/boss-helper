// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loaderMock, stopOne, stopTwo } = vi.hoisted(() => ({
  loaderMock: vi.fn(),
  stopOne: vi.fn(),
  stopTwo: vi.fn(),
}))

vi.mock('@/utils', () => ({
  loader: loaderMock,
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/composables/useVue', () => ({
  getRootVue: vi.fn(),
}))

vi.mock('@/site-adapters', () => ({
  getSiteAdapterByUrl: vi.fn(),
  isSupportedSiteUrl: vi.fn(() => true),
  setActiveSiteAdapter: vi.fn(),
}))

vi.mock('@/utils/selectors', () => ({
  DOM_READY_TIMEOUT_MS: 15000,
  collectSelectorHealth: vi.fn(() => []),
  formatSelectorHealth: vi.fn(() => 'ok'),
  getActiveSelectorRegistry: vi.fn(() => ({ extension: { appRoot: '#boss-helper', appRootId: 'boss-helper' } })),
  waitForDocumentReady: vi.fn(async () => {}),
}))

import { installAxiosLoaderInterceptors } from '@/entrypoints/main-world'

type InterceptorHandler<T> = {
  onFulfilled: (value: T) => T | Promise<T>
  onRejected: (error: unknown) => Promise<never>
}

function createAxiosInterceptorHarness() {
  const requestHandlers: Array<InterceptorHandler<Record<string, unknown>>> = []
  const responseHandlers: Array<InterceptorHandler<Record<string, unknown>>> = []

  const client = {
    interceptors: {
      request: {
        use(onFulfilled: InterceptorHandler<Record<string, unknown>>['onFulfilled'], onRejected: InterceptorHandler<Record<string, unknown>>['onRejected']) {
          requestHandlers.push({ onFulfilled, onRejected })
          return requestHandlers.length
        },
      },
      response: {
        use(onFulfilled: InterceptorHandler<Record<string, unknown>>['onFulfilled'], onRejected: InterceptorHandler<Record<string, unknown>>['onRejected']) {
          responseHandlers.push({ onFulfilled, onRejected })
          return responseHandlers.length
        },
      },
    },
  }

  installAxiosLoaderInterceptors(client as never)

  return {
    requestError: requestHandlers[0].onRejected,
    requestSuccess: requestHandlers[0].onFulfilled,
    responseError: responseHandlers[0].onRejected,
    responseSuccess: responseHandlers[0].onFulfilled,
  }
}

describe('installAxiosLoaderInterceptors', () => {
  beforeEach(() => {
    loaderMock.mockReset()
    stopOne.mockReset()
    stopTwo.mockReset()
  })

  it('uses a no-op loader when timeout is missing', async () => {
    const harness = createAxiosInterceptorHarness()
    const requestConfig = { url: 'https://example.com/no-timeout' }
    const expectedError = new Error('request failed')

    loaderMock.mockReturnValue(stopOne)

    await harness.requestSuccess(requestConfig)
    await expect(harness.requestError({ config: requestConfig, cause: expectedError })).rejects.toMatchObject({
      cause: expectedError,
      config: requestConfig,
    })

    expect(loaderMock).not.toHaveBeenCalled()
    expect(stopOne).not.toHaveBeenCalled()
  })

  it('keeps loaders isolated per concurrent request', async () => {
    const harness = createAxiosInterceptorHarness()
    const requestA = { timeout: 1000, url: 'https://example.com/a' }
    const requestB = { timeout: 2000, url: 'https://example.com/b' }

    loaderMock.mockReturnValueOnce(stopOne).mockReturnValueOnce(stopTwo)

    await harness.requestSuccess(requestA)
    await harness.requestSuccess(requestB)
    await harness.responseSuccess({ config: requestB, data: { ok: true } })

    expect(stopOne).not.toHaveBeenCalled()
    expect(stopTwo).toHaveBeenCalledTimes(1)

    await expect(harness.responseError({ config: requestA, message: 'boom' })).rejects.toMatchObject({
      config: requestA,
      message: 'boom',
    })

    expect(loaderMock).toHaveBeenNthCalledWith(1, { color: '#F79E63', ms: 1000 })
    expect(loaderMock).toHaveBeenNthCalledWith(2, { color: '#F79E63', ms: 2000 })
    expect(stopOne).toHaveBeenCalledTimes(1)
    expect(stopTwo).toHaveBeenCalledTimes(1)
  })
})
