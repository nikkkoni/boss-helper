// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCounterRequest } = vi.hoisted(() => ({
  mockCounterRequest: vi.fn(),
}))

vi.mock('@/message', () => ({
  counter: {
    request: mockCounterRequest,
  },
}))

import { RequestError, request } from '@/utils/request'

describe('request', () => {
  beforeEach(() => {
    mockCounterRequest.mockReset()
  })

  it('passes timeout values through in milliseconds', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))

    await request.get({ timeout: 1500, url: 'https://example.com/timeout-ms' })

    expect(timeoutSpy).toHaveBeenCalledWith(1500)
  })

  it('parses json responses in foreground mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    )

    await expect(request.get({ url: 'https://example.com' })).resolves.toEqual({ ok: true })
  })

  it('parses document responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<html><body><main id="app">hello</main></body></html>', { status: 200 })),
    )

    const doc = await request.get({
      responseType: 'document',
      url: 'https://example.com/doc',
    })

    expect(doc.querySelector('#app')?.textContent).toBe('hello')
  })

  it('parses text responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('plain text', { status: 200 })))

    await expect(
      request.get({
        responseType: 'text',
        url: 'https://example.com/text',
      }),
    ).resolves.toBe('plain text')
  })

  it('parses arraybuffer and blob responses', async () => {
    const bytes = Uint8Array.from([1, 2, 3])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200 })))

    const arrayBuffer = await request.get({
      responseType: 'arraybuffer',
      url: 'https://example.com/buffer',
    })

    expect([...new Uint8Array(arrayBuffer)]).toEqual([1, 2, 3])

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('blob body', { status: 200 })),
    )

    const blob = await request.get({
      responseType: 'blob',
      url: 'https://example.com/blob',
    })

    expect(await blob.text()).toBe('blob body')
  })

  it('returns stream responses when the body is available', async () => {
    const response = new Response('stream body', { status: 200 })
    vi.stubGlobal('fetch', vi.fn(async () => response))

    await expect(
      request.get({
        responseType: 'stream',
        url: 'https://example.com/stream',
      }),
    ).resolves.toBe(response.body)
  })

  it('rejects stream requests when the response body is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))

    await expect(
      request.get({
        responseType: 'stream',
        url: 'https://example.com/no-stream',
      }),
    ).rejects.toMatchObject({
      message: '没有响应体',
      name: '请求错误',
    })
  })

  it('turns non-2xx responses into RequestError with statusCode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('too many', { status: 429, statusText: 'Too Many Requests' })),
    )

    await expect(request.post({ url: 'https://example.com/fail' })).rejects.toMatchObject({
      message: '状态码: 429: too many | Too Many Requests',
      name: '请求错误',
      statusCode: 429,
    })
  })

  it('maps abort errors to timeout messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const error = new Error('aborted')
        ;(error as Error & { name: string }).name = 'AbortError'
        throw error
      }),
    )

    await expect(request.get({ timeout: 1, url: 'https://example.com/timeout' })).rejects.toEqual(
      expect.objectContaining({
        message: '请求超时',
      }),
    )
  })

  it('maps background abort-like errors into timeout messages', async () => {
    mockCounterRequest.mockRejectedValueOnce(new Error('The user aborted a request.'))

    await expect(request.get({ isBackground: true, url: 'https://example.com/bg-timeout' })).rejects.toEqual(
      expect.objectContaining({
        message: '请求超时',
        name: '请求错误',
      }),
    )
  })

  it('delegates background requests to counter.request and extracts status codes from errors', async () => {
    mockCounterRequest.mockResolvedValueOnce(new Error('状态码: 503: upstream failed'))

    await expect(request.get({ isBackground: true, url: 'https://example.com/bg' })).rejects.toEqual(
      expect.objectContaining({
        message: '状态码: 503: upstream failed',
        statusCode: 503,
      }),
    )
  })

  it('returns background responses unchanged when the bridge succeeds', async () => {
    mockCounterRequest.mockResolvedValueOnce({ bridge: true })

    await expect(request.post({ isBackground: true, url: 'https://example.com/bg-ok' })).resolves.toEqual(
      { bridge: true },
    )
  })

  it('maps background string errors into RequestError instances', async () => {
    mockCounterRequest.mockRejectedValueOnce('状态码: 502: bad gateway')

    await expect(request.get({ isBackground: true, url: 'https://example.com/bg-string-error' })).rejects.toEqual(
      expect.objectContaining({
        message: '状态码: 502: bad gateway',
        statusCode: 502,
      }),
    )
  })

  it('keeps explicit RequestError instances intact', async () => {
    mockCounterRequest.mockRejectedValueOnce(new RequestError('custom'))

    await expect(request.get({ isBackground: true, url: 'https://example.com/custom' })).rejects.toBeInstanceOf(
      RequestError,
    )
  })

  it('maps non-abort fetch failures into RequestError instances', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw 'socket closed'
    }))

    await expect(request.get({ url: 'https://example.com/socket-closed' })).rejects.toEqual(
      expect.objectContaining({
        message: 'socket closed',
        name: '请求错误',
      }),
    )
  })
})
