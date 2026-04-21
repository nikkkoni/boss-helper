import type { LlmInfo } from './type'

export interface other {
  other: {
    timeout?: number
    background?: boolean
    pricingInputPerMillion?: number
    pricingOutputPerMillion?: number
  }
}

export const other: LlmInfo<other>['other'] = {
  value: {
    timeout: {
      value: 1800,
      type: 'inputNumber',
      desc: 'GPT请求的超时时间，单位为秒；超时后不会进行重试将跳过岗位，默认 1800 秒 / 30 分钟',
    },
    background: {
      value: false,
      type: 'switch',
      desc: '是否在后台请求, 当遇到跨域错误时, 可以开启将在扩展中请求.',
    },
    pricingInputPerMillion: {
      value: 0,
      type: 'inputNumber',
      desc: '输入 token 单价，单位为每百万 token；仅用于统计估算费用。0 表示不计费。',
    },
    pricingOutputPerMillion: {
      value: 0,
      type: 'inputNumber',
      desc: '输出 token 单价，单位为每百万 token；仅用于统计估算费用。0 表示不计费。',
    },
  },
  alert: 'warning',
  label: '其他配置',
}

export const desc = {
  max_tokens: '用处不大一般不需要调整',
  temperature: '较高的数值会使输出更加随机，而较低的数值会使其更加集中和确定',
  top_p: '影响输出文本的多样性，取值越大，生成文本的多样性越强',
}
