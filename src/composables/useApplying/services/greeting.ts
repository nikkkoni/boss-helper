import { miTem } from 'mitem'

import type { modelData } from '@/composables/useModel'
import type { Llm } from '@/composables/useModel/type'
import { Message } from '@/composables/useWebSocket'
import { recordOutgoingChatMessage } from '@/pages/zhipin/services/chatStreamMessages'
import { useConf } from '@/stores/conf'
import type { logData } from '@/stores/log'

import { requestBossData } from '../utils'
import { recordAIUsage } from './usageTracker'

function buildAmapTemplateData(ctx: logData) {
  return {
    straightDistance: (ctx.amap?.distance?.straight.distance ?? 0) / 1000,
    drivingDistance: (ctx.amap?.distance?.driving.distance ?? 0) / 1000,
    drivingDuration: (ctx.amap?.distance?.driving.duration ?? 0) / 60,
    walkingDistance: (ctx.amap?.distance?.walking.distance ?? 0) / 1000,
    walkingDuration: (ctx.amap?.distance?.walking.duration ?? 0) / 60,
  }
}

export async function ensureGreetingBossData(ctx: logData) {
  if (ctx.bossData == null) {
    ctx.bossData = await requestBossData(ctx.listData.card!)
  }

  return ctx.bossData
}

export async function sendGreetingMessage(options: {
  uid: string | number
  ctx: logData
  content: string
}) {
  const conf = useConf()
  const bossData = await ensureGreetingBossData(options.ctx)
  options.ctx.message = options.content

  const buf = new Message({
    form_uid: String(options.uid),
    to_uid: bossData.data.bossId.toString(),
    to_name: bossData.data.encryptBossId,
    content: options.content,
  })

  await buf.send({
    timeoutMs: Math.max(0, conf.formData.delay.messageSending) * 1000,
  })
  recordOutgoingChatMessage({
    content: options.content,
    createdAt: buf.createdAt,
    form_uid: String(options.uid),
    messageId: buf.messageId,
    to_name: bossData.data.encryptBossId,
    to_uid: bossData.data.bossId.toString(),
  })
}

export function createCustomGreetingSender(options: {
  template: string
  uid: string | number
  useVariables: boolean
}) {
  const compiledTemplate = miTem.compile(options.template)

  return async (ctx: logData) => {
    const bossData = await ensureGreetingBossData(ctx)
    const content =
      options.useVariables && ctx.listData.card
        ? compiledTemplate({
            data: ctx.listData,
            boss: bossData,
            card: ctx.listData.card,
            amap: buildAmapTemplateData(ctx),
          })
        : options.template

    await sendGreetingMessage({
      uid: options.uid,
      ctx,
      content,
    })
  }
}

export async function runAIGreeting(options: {
  ctx: logData
  gpt: Llm
  model?: Pick<modelData, 'data'>
  onPrompt: (s: string) => void
  uid: string | number
}) {
  const bossData = await ensureGreetingBossData(options.ctx)
  const response = await options.gpt.message(
    {
      data: {
        data: options.ctx.listData,
        boss: bossData,
        card: options.ctx.listData.card!,
        amap: buildAmapTemplateData(options.ctx),
      },
      onPrompt: options.onPrompt,
    },
    'aiGreeting',
  )

  recordAIUsage(response.usage, options.model)

  options.ctx.aiGreetingQ = response.prompt
  if (response.content == null) {
    return
  }

  const content =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content)

  options.ctx.aiGreetingA = content
  options.ctx.aiGreetingR = response.reasoning_content

  await sendGreetingMessage({
    uid: options.uid,
    ctx: options.ctx,
    content,
  })
}
