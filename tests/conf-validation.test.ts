import { describe, expect, it } from 'vitest'

import { validateConfigPatch } from '@/stores/conf/validation'
import type { FormData } from '@/types/formData'

function createValidPatch(): Partial<FormData> {
  return {
    deliveryLimit: { value: 100 },
    delay: {
      deliveryStarts: 1,
      deliveryInterval: 2,
      deliveryIntervalRandomOffset: 3,
      deliveryPageNext: 3,
    },
    salaryRange: {
      enable: true,
      value: [10, 20, false],
      advancedValue: {
        H: [20, 30, false],
        D: [300, 500, false],
        M: [10000, 20000, false],
      },
    },
    companySizeRange: {
      enable: true,
      value: [50, 500, false],
    },
    aiFiltering: {
      enable: true,
      prompt: '',
      score: 60,
      externalMode: true,
      externalTimeoutMs: 5000,
    },
    customGreeting: {
      enable: true,
      value: '你好，想了解一下这个机会',
    },
    aiGreeting: {
      enable: true,
      model: 'model-1',
      prompt: '生成 {{ card.jobName }} 的开场消息',
    },
    greetingVariable: {
      value: true,
    },
  }
}

describe('validateConfigPatch', () => {
  it('accepts a valid runtime patch', () => {
    expect(validateConfigPatch(createValidPatch())).toEqual([])
  })

  it('reports field-level validation errors for invalid values', () => {
    const errors = validateConfigPatch({
      ...createValidPatch(),
      deliveryLimit: { value: 0 },
      delay: {
        deliveryStarts: -1,
        deliveryInterval: 2,
        deliveryIntervalRandomOffset: -1,
        deliveryPageNext: 3,
      },
      companySizeRange: {
        enable: true,
        value: [500, 50, false],
      },
      aiFiltering: {
        enable: true,
        prompt: '',
        score: 120,
        externalTimeoutMs: 500,
      },
      customGreeting: {
        enable: true,
        value: '',
      },
      aiGreeting: {
        enable: true,
        model: '',
        prompt: '',
      },
      greetingVariable: {
        value: 'yes' as unknown as boolean,
      },
    })

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'deliveryLimit.value', code: 'invalid-delivery-limit' }),
        expect.objectContaining({ field: 'delay.deliveryStarts', code: 'invalid-delay-value' }),
        expect.objectContaining({ field: 'delay.deliveryIntervalRandomOffset', code: 'invalid-delay-value' }),
        expect.objectContaining({ field: 'companySizeRange.value', code: 'range-order-invalid' }),
        expect.objectContaining({ field: 'aiFiltering.score', code: 'invalid-ai-filter-score' }),
        expect.objectContaining({ field: 'aiFiltering.externalTimeoutMs', code: 'invalid-ai-filter-timeout' }),
        expect.objectContaining({ field: 'customGreeting.value', code: 'empty-custom-greeting' }),
        expect.objectContaining({ field: 'aiGreeting.model', code: 'empty-ai-greeting-model' }),
        expect.objectContaining({ field: 'aiGreeting.prompt', code: 'empty-ai-greeting-prompt' }),
        expect.objectContaining({ field: 'greetingVariable.value', code: 'invalid-boolean-value' }),
      ]),
    )
  })

  it('rejects malformed AI greeting prompt messages', () => {
    const errors = validateConfigPatch({
      aiGreeting: {
        enable: true,
        model: 'model-1',
        prompt: [{ role: 'invalid', content: 'hello' }] as unknown as FormData['aiGreeting']['prompt'],
      },
    })

    expect(errors).toContainEqual(
      expect.objectContaining({
        field: 'aiGreeting.prompt.0',
        code: 'invalid-prompt-message',
      }),
    )
  })

  it('rejects malformed range structures', () => {
    const errors = validateConfigPatch({
      salaryRange: {
        enable: true,
        value: [10, 20, false],
        advancedValue: {
          H: [1, 2, false],
          D: [3, 4, false],
          M: [5, 6] as unknown as FormData['salaryRange']['advancedValue']['M'],
        },
      },
    })

    expect(errors).toContainEqual(
      expect.objectContaining({
        field: 'salaryRange.advancedValue.M',
        code: 'invalid-range-structure',
      }),
    )
  })
})
