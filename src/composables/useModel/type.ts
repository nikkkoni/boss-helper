import type { ElInput, ElInputNumber, ElSelectV2, ElSlider, ElSwitch } from 'element-plus'
import { miTem } from 'mitem'

export interface AmapMessageData {
  drivingDistance: number
  drivingDuration: number
  straightDistance: number
  walkingDistance: number
  walkingDuration: number
}

export interface LlmMessageData {
  data?: bossZpJobItemData
  boss?: bossZpBossData
  card?: bossZpCardData
  amap?: AmapMessageData
}

export interface StructuredOutputOptions {
  name: string
  schema: Record<string, unknown>
}

export interface LlmMessageArgs {
  amap?: string
  data: LlmMessageData
  onPrompt?: (s: string) => void
  onStream?: (s: string) => void
  json?: boolean
  structuredOutput?: StructuredOutputOptions
  test?: boolean
}

type PromptTemplateInput = object

export abstract class Llm<C = unknown> {
  conf: C
  tem: (templateData: PromptTemplateInput) => string
  template: string | Prompt
  constructor(conf: C, template: string | Prompt) {
    this.conf = conf
    this.template = template

    if (typeof template === 'string') {
      this.tem = miTem.compile(template) as (templateData: PromptTemplateInput) => string
    } else {
      if (template.length === 0) {
        throw new Error('多对话提示词不能为空')
      }
      this.tem = miTem.compile(template[template.length - 1].content) as (
        templateData: PromptTemplateInput,
      ) => string
    }
  }

  buildPrompt(data: PromptTemplateInput | string): Prompt {
    if (typeof data === 'string') {
      return [
        {
          content: data,
          role: 'user',
        },
      ]
    } else if (Array.isArray(this.template)) {
      const temp = this.template.map((item) => ({ ...item }))
      temp[temp.length - 1].content = this.tem(data)
      return temp
    } else {
      return [
        {
          content: this.tem(data),
          role: 'user',
        },
      ]
    }
  }
  abstract chat(message: string): Promise<string>
  abstract message(
    args: LlmMessageArgs,
    type: 'aiGreeting' | 'aiFiltering' | 'aiReply',
  ): Promise<MessageResponse>
}

export interface MessageResponse<T = string> {
  content?: T
  reasoning_content?: string | null
  prompt?: string
  usage?: { total_tokens: number; input_tokens: number; output_tokens: number }
}

export type LlmConf<M extends string, T> = { mode: M } & T

export type FormElm =
  | { type: 'input'; config?: InstanceType<typeof ElInput>['$props'] }
  | {
      type: 'inputNumber'
      config?: InstanceType<typeof ElInputNumber>['$props']
    }
  | { type: 'slider'; config?: InstanceType<typeof ElSlider>['$props'] }
  | { type: 'switch'; config?: InstanceType<typeof ElSwitch>['$props'] }
  | { type: 'select'; config?: InstanceType<typeof ElSelectV2>['$props'] }

export type LlmInfoVal<T, R> =
  T extends Record<string, unknown>
    ? {
        value: LlmInfo<NonNullable<T>>
        label?: string
        desc?: string
        alert: 'success' | 'warning' | 'info' | 'error'
      }
    : {
        value?: T
        label?: string
        desc?: string
      } & FormElm & { [K in keyof R]: R[K] }

export type LlmInfo<T extends object> = {
  [K in keyof T]-?: K extends 'mode'
    ? {
        mode: T[K]
        label: string
        icon?: string
        desc?: string
        disabled?: boolean
      }
    : LlmInfoVal<T[K], undefined extends T[K] ? object : { required: true }>
}

export type Prompt = Array<{
  role: 'system' | 'user' | 'assistant'
  content: string
}>

export { Llm as llm }
export type formElm = FormElm
export type llmConf<M extends string, T> = LlmConf<M, T>
export type llmInfo<T extends object> = LlmInfo<T>
export type llmInfoVal<T, R> = LlmInfoVal<T, R>
export type llmMessageArgs = LlmMessageArgs
export type llmMessageData = LlmMessageData
export type messageReps<T = string> = MessageResponse<T>
export type prompt = Prompt
