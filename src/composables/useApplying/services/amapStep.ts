import type { logData } from '@/stores/log'
import { JobAddressError, UnknownError } from '@/types/deliverError'
import { amapDistance, amapGeocode } from '@/utils/amap'
import { logger } from '@/utils/logger'

import type { Handler, StepArgs } from '../type'

export function buildAmapPrompt(ctx: logData, enabled: boolean) {
  if (!enabled) {
    return ''
  }

  return `直线距离:${(ctx.amap?.distance?.straight?.distance ?? 0) / 1000}km
驾车距离:${(ctx.amap?.distance?.driving?.distance ?? 0) / 1000}km
驾车时间:${(ctx.amap?.distance?.driving?.duration ?? 0) / 60}分钟
步行距离:${(ctx.amap?.distance?.walking?.distance ?? 0) / 1000}km
步行时间:${(ctx.amap?.distance?.walking?.duration ?? 0) / 60}分钟`
}

export function createLoadCardStep(): Handler {
  return async (args: StepArgs) => {
    if (args.data.card == null) {
      if ((await args.data.getCard()) == null) {
        throw new UnknownError('Card 信息获取失败')
      }
    }
  }
}

export function createResolveAmapStep(): Handler {
  return async (args: StepArgs, ctx: logData) => {
      ctx.amap ??= {}
      try {
        ctx.amap.geocode = await amapGeocode(
          args.data.card?.address ?? args.data.card?.jobInfo?.address ?? '',
        )
      if (!ctx.amap.geocode?.location) {
        throw new JobAddressError('未获取到地址经纬度')
      }
      ctx.amap.distance = await amapDistance(ctx.amap.geocode.location)
    } catch (e) {
      logger.error('高德地图错误', e)
      throw new JobAddressError(`错误: ${e instanceof Error ? e.message : '未知'}`, {
        cause: e instanceof Error ? e : undefined,
      })
    }
  }
}
