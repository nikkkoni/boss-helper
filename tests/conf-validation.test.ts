import { describe, expect, it } from 'vitest'

import { validateConfigPatch } from '@/stores/conf/validation'
import type { FormData } from '@/types/formData'

function createValidPatch(): Partial<FormData> {
  return {
    deliveryLimit: { value: 100 },
    delay: {
      deliveryStarts: 1,
      deliveryInterval: 2,
      deliveryPageNext: 3,
      messageSending: 4,
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
        deliveryPageNext: 3,
        messageSending: 4,
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
    })

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'deliveryLimit.value', code: 'invalid-delivery-limit' }),
        expect.objectContaining({ field: 'delay.deliveryStarts', code: 'invalid-delay-value' }),
        expect.objectContaining({ field: 'companySizeRange.value', code: 'range-order-invalid' }),
        expect.objectContaining({ field: 'aiFiltering.score', code: 'invalid-ai-filter-score' }),
        expect.objectContaining({ field: 'aiFiltering.externalTimeoutMs', code: 'invalid-ai-filter-timeout' }),
      ]),
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