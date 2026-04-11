import { ElMessage } from 'element-plus'

import type { modelData } from '@/composables/useModel'
import { SignedKeyLLM } from '@/composables/useModel/signedKey'
import type { Llm } from '@/composables/useModel/type'
import type { logData } from '@/stores/log'
import { useUser } from '@/stores/user'
import { GreetError } from '@/types/deliverError'

import type { StepArgs, StepFactory } from '../type'
import { errorHandle } from '../utils'
import { warmSignedKeyResume } from './aiFiltering'
import { createCustomGreetingSender, runAIGreeting, sendGreetingMessage } from './greeting'

function getGreetingUid() {
  const uid = useUser().getUserId()
  if (uid == null) {
    ElMessage.error('没有获取到uid,请刷新重试')
    throw new GreetError('没有获取到uid')
  }
  return uid
}

export function createExternalGreetingStep() {
  const uid = getGreetingUid()

  return async (_args: StepArgs, ctx: logData) => {
    if (!ctx.externalGreeting) {
      return
    }

    try {
      ctx.aiGreetingA = ctx.externalGreeting
      await sendGreetingMessage({
        uid,
        ctx,
        content: ctx.externalGreeting,
      })
    } catch (e) {
      throw new GreetError(errorHandle(e), e instanceof Error ? { cause: e } : undefined)
    }
  }
}

export function createCustomGreetingStep(options: {
  template: string
  useVariables: boolean
}): StepFactory {
  return () => {
    const sendCustomGreeting = createCustomGreetingSender({
      template: options.template,
      uid: getGreetingUid(),
      useVariables: options.useVariables,
    })

    return {
      after: async (_args, ctx) => {
        try {
          await sendCustomGreeting(ctx)
        } catch (e) {
          throw new GreetError(errorHandle(e), e instanceof Error ? { cause: e } : undefined)
        }
      },
    }
  }
}

export function createAIGreetingStep(options: {
  getModel: () => Llm | SignedKeyLLM
  model?: Pick<modelData, 'data' | 'vip'>
  onPrompt: (ctx: logData, s: string) => void
}): StepFactory {
  return () => {
    const gpt = options.getModel()
    if (gpt instanceof SignedKeyLLM) {
      warmSignedKeyResume(gpt, 'aiGreeting')
    }

    const uid = getGreetingUid()

    return {
      after: async (_args, ctx) => {
        try {
          await runAIGreeting({
            ctx,
            gpt,
            model: options.model,
            onPrompt: (s) => options.onPrompt(ctx, s),
            uid,
          })
        } catch (e) {
          throw new GreetError(errorHandle(e), e instanceof Error ? { cause: e } : undefined)
        }
      },
    }
  }
}

export function composeGreetingStep(
  base: ReturnType<StepFactory>,
  externalAfter: ReturnType<typeof createExternalGreetingStep>,
) {
  const baseAfter = typeof base === 'object' && base != null ? base.after : undefined

  if (!baseAfter) {
    return {
      after: externalAfter,
    }
  }

  return {
    after: async (args: StepArgs, ctx: logData) => {
      if (ctx.externalGreeting) {
        return externalAfter(args, ctx)
      }
      return baseAfter(args, ctx)
    },
  }
}
