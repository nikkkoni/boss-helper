import { useConf } from '@/stores/conf'
import { request } from '@/utils/request'

export interface AmapError {
  status: string
  info: string
  infocode: string
}

export interface AmapGeocode {
  status: string
  info: string
  infocode: string
  count: string
  geocodes: Array<{
    formatted_address: string
    country: string
    province: string
    citycode: string
    city: string
    district: string
    township: unknown[]
    neighborhood: {
      name: unknown[]
      type: unknown[]
    }
    building: {
      name: unknown[]
      type: unknown[]
    }
    adcode: string
    street: unknown[]
    number: unknown[]
    location: string
    level: string
  }>
}
export interface AmapDistance {
  status: string
  info: string
  infocode: string
  count: string
  results: Array<{
    origin_id: string
    dest_id: string
    distance: string
    duration: string
  }>
}

type AmapDistanceMode = 'straight' | 'driving' | 'walking'

export interface AmapDistanceMetric {
  ok: boolean
  distance: number
  duration: number
}

export type AmapDistanceResult = Record<AmapDistanceMode, AmapDistanceMetric>

export async function amapGeocode(
  address: string,
): Promise<AmapGeocode['geocodes'][number] | undefined> {
  const { formData } = useConf()
  const params = new URLSearchParams({
    address,
    output: 'JSON',
    Key: formData.amap.key,
  })
  const res = (await request.get({
    url: `https://restapi.amap.com/v3/geocode/geo?${params.toString()}`,
  })) as AmapGeocode | AmapError
  if (res.status !== '1' || !('geocodes' in res)) {
    throw new Error(res.info)
  }
  return res.geocodes?.[0]
}

export async function amapDistance(destination: string) {
  const { formData } = useConf()
  const data: AmapDistanceResult = {
    straight: { ok: false, distance: 0, duration: 0 },
    driving: { ok: false, distance: 0, duration: 0 },
    walking: { ok: false, distance: 0, duration: 0 },
  }

  const createDistanceRequest = async (type: 0 | 1 | 3) => {
    const params = new URLSearchParams({
      origins: formData.amap.origins,
      destination,
      type: String(type),
      output: 'JSON',
      Key: formData.amap.key,
    })
    return (await request.get({
      url: `https://restapi.amap.com/v3/distance?${params.toString()}`,
    })) as AmapDistance | AmapError
  }

  const requestPlan: Array<{ mode: AmapDistanceMode; type: 0 | 1 | 3 }> = []
  if (formData.amap.straightDistance > 0) {
    requestPlan.push({ mode: 'straight', type: 0 })
  }
  if (formData.amap.drivingDistance > 0 || formData.amap.drivingDuration > 0) {
    requestPlan.push({ mode: 'driving', type: 1 })
  }
  if (formData.amap.walkingDistance > 0 || formData.amap.walkingDuration > 0) {
    requestPlan.push({ mode: 'walking', type: 3 })
  }

  const responses = await Promise.all(
    requestPlan.map(async ({ mode, type }) => ({
      mode,
      response: await createDistanceRequest(type),
    })),
  )

  for (const { mode, response } of responses) {
    if (response.status === '1' && 'results' in response) {
      data[mode].ok = true
      data[mode].distance = Number(response.results?.[0]?.distance)
      data[mode].duration = Number(response.results?.[0]?.duration)
    }
  }
  return data
}
