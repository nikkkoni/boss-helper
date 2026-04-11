import type { Statistics } from '@/types/formData'

import { errorHandle } from '../../utils'

export type ToCause = (error: unknown) => { cause: Error } | undefined
export type ApplyingStatistics = { todayData: Statistics }
type FilterStatisticKey =
  | 'activityFilter'
  | 'company'
  | 'companySizeRange'
  | 'goldHunterFilter'
  | 'hrPosition'
  | 'jobAddress'
  | 'jobContent'
  | 'jobTitle'
  | 'repeat'
  | 'salaryRange'

type FilterErrorCtor = new (message: string, options?: ErrorOptions) => Error

export async function withFilterError(
  statistics: ApplyingStatistics,
  key: FilterStatisticKey,
  ErrorCtor: FilterErrorCtor,
  toCause: ToCause,
  run: () => Promise<void>,
) {
  try {
    await run()
  } catch (error) {
    statistics.todayData[key]++
    throw new ErrorCtor(errorHandle(error), toCause(error))
  }
}

export function escapeRegExp(source: string) {
  return source.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
