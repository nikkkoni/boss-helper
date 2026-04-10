import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockConf, mockRequestGet } = vi.hoisted(() => ({
  mockConf: {
    formData: {
      amap: {
        key: 'amap-key',
        origins: '121.1,31.2',
        straightDistance: 3,
        drivingDistance: 5,
        drivingDuration: 15,
        walkingDistance: 2,
        walkingDuration: 20,
      },
    },
  },
  mockRequestGet: vi.fn(),
}))

vi.mock('@/stores/conf', () => ({
  useConf: () => mockConf,
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
    mockConf.formData.amap.straightDistance = 3
    mockConf.formData.amap.drivingDistance = 5
    mockConf.formData.amap.drivingDuration = 15
    mockConf.formData.amap.walkingDistance = 2
    mockConf.formData.amap.walkingDuration = 20
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
    const geocodeUrl = new URL(mockRequestGet.mock.calls[0][0].url as string)
    expect(geocodeUrl.searchParams.get('address')).toBe('上海张江')
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

  it('encodes amap query parameters instead of interpolating raw user input', async () => {
    mockRequestGet
      .mockResolvedValueOnce({
        count: '1',
        geocodes: [{ location: '121.1,31.2', formatted_address: '上海市张江路' }],
        info: 'OK',
        infocode: '10000',
        status: '1',
      })
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
        count: '1',
        info: 'OK',
        infocode: '10000',
        results: [{ distance: '3000', duration: '600' }],
        status: '1',
      })

    await amapGeocode('上海 张江&role=admin')
    await amapDistance('121.2,31.3&mode=hijack')

    const geocodeUrl = new URL(mockRequestGet.mock.calls[0][0].url as string)
    expect(geocodeUrl.searchParams.get('address')).toBe('上海 张江&role=admin')
    expect(geocodeUrl.searchParams.get('role')).toBeNull()

    const distanceUrl = new URL(mockRequestGet.mock.calls[1][0].url as string)
    expect(distanceUrl.searchParams.get('destination')).toBe('121.2,31.3&mode=hijack')
    expect(distanceUrl.searchParams.get('mode')).toBeNull()
  })

  it('only requests enabled distance modes', async () => {
    mockConf.formData.amap.straightDistance = 0
    mockConf.formData.amap.drivingDistance = 10
    mockConf.formData.amap.drivingDuration = 0
    mockConf.formData.amap.walkingDistance = 0
    mockConf.formData.amap.walkingDuration = 0

    mockRequestGet.mockResolvedValueOnce({
      count: '1',
      info: 'OK',
      infocode: '10000',
      results: [{ distance: '2800', duration: '420' }],
      status: '1',
    })

    await expect(amapDistance('121.2,31.3')).resolves.toEqual({
      driving: { distance: 2800, duration: 420, ok: true },
      straight: { distance: 0, duration: 0, ok: false },
      walking: { distance: 0, duration: 0, ok: false },
    })

    expect(mockRequestGet).toHaveBeenCalledTimes(1)
    const requestUrl = new URL(mockRequestGet.mock.calls[0][0].url as string)
    expect(requestUrl.searchParams.get('type')).toBe('1')
  })
})
