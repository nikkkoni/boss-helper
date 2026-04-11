import { JobAddressError } from '@/types/deliverError'
import type { FormData } from '@/types/formData'

import type { StepFactory } from '../../type'

function assertAmapLimit(
  id: string,
  limitDistance: number,
  limitDuration: number,
  amap?: {
    ok: boolean
    distance: number
    duration: number
  },
) {
  if (!amap || amap.ok === false) {
    throw new JobAddressError('高德地图未初始化')
  }
  if (limitDistance > 0 && amap.distance > limitDistance * 1000) {
    throw new JobAddressError(`${id}距离超标: ${amap.distance / 1000} 设定: ${limitDistance}`)
  }
  if (limitDuration > 0 && amap.duration > limitDuration * 60) {
    throw new JobAddressError(`${id}时间超标: ${amap.duration / 60} 设定: ${limitDuration}`)
  }
}

export function createAmapStep(formData: FormData): StepFactory {
  return () => {
    if (!formData.amap.enable) {
      return
    }

    return async (_, ctx) => {
      if (ctx.amap?.distance == null) {
        throw new JobAddressError('高德地图api数据异常')
      }

      assertAmapLimit('直线', formData.amap.straightDistance, 0, ctx.amap.distance.straight)
      assertAmapLimit(
        '驾车',
        formData.amap.drivingDistance,
        formData.amap.drivingDuration,
        ctx.amap.distance.driving,
      )
      assertAmapLimit(
        '步行',
        formData.amap.walkingDistance,
        formData.amap.walkingDuration,
        ctx.amap.distance.walking,
      )
    }
  }
}
