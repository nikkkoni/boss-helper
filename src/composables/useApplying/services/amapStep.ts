import { UnknownError } from '@/types/deliverError'

import type { Handler, StepArgs } from '../type'

export function createLoadCardStep(): Handler {
  return async (args: StepArgs) => {
    if (args.data.card == null) {
      if ((await args.data.getCard()) == null) {
        throw new UnknownError('Card 信息获取失败')
      }
    }
  }
}
