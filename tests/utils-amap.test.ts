import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequestGet } = vi.hoisted(() => ({
  mockRequestGet: vi.fn(),
}))

vi.mock('@/stores/conf', () => ({
  useConf: () => ({
    formData: {
      amap: {
        key: 'amap-key',
        origins: '121.1,31.2',
      },
    },
  }),
}))

vi.mock('@/utils/request', () => ({
  request: {
    get: mockRequestGet,
  },
}))

import { amapDistance, amapGeocode } from '@/utils/amap'

describe('amap helpers', () => {
  beforeEach(() => {
    mockRequestGet.mockReset()
  })

  it('returns the first geocode result', async () => {
    mockRequestGet.mockResolvedValueOnce({
      count: '1',
      geocodes: [{ location: '121.1,31.2', formatted_address: '上海市张江路' }],
      info: 'OK',
      infocode: '10000',
      status: '1',
    })

    await expect(amapGeocode('上海张江')).resolves.toEqual(
      expect.objectContaining({ location: '121.1,31.2' }),
    )
    expect(mockRequestGet).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('address=上海张江'),
      }),
    )
  })

  it('throws when geocode api returns an error payload', async () => {
    mockRequestGet.mockResolvedValueOnce({
      info: 'INVALID_USER_KEY',
      infocode: '10001',
      status: '0',
    })

    await expect(amapGeocode('上海张江')).rejects.toThrow('INVALID_USER_KEY')
  })

  it('aggregates distance responses by route type', async () => {
    mockRequestGet
      .mockResolvedValueOnce({
        count: '1',
        info: 'OK',
        infocode: '10000',
        results: [{ distance: '1000', duration: '60' }],
        status: '1',
      })
      .mockResolvedValueOnce({
        count: '1',
        info: 'OK',
        infocode: '10000',
        results: [{ distance: '2000', duration: '300' }],
        status: '1',
      })
      .mockResolvedValueOnce({
        info: 'FAILED',
        infocode: '20000',
        status: '0',
      })

    await expect(amapDistance('121.2,31.3')).resolves.toEqual({
      driving: { distance: 2000, duration: 300, ok: true },
      straight: { distance: 1000, duration: 60, ok: true },
      walking: { distance: 0, duration: 0, ok: false },
    })
  })
})
