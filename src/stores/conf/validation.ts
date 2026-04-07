import type { BossHelperAgentValidationError } from '@/message/agent'
import type { FormData, FormDataRange } from '@/types/formData'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateRangeValue(
  field: string,
  value: unknown,
  errors: BossHelperAgentValidationError[],
) {
  if (!Array.isArray(value) || value.length < 3) {
    errors.push({
      field,
      code: 'invalid-range-structure',
      message: '范围配置必须是 [min, max, strict] 结构',
    })
    return
  }

  const [min, max, strict] = value as FormDataRange
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) {
    errors.push({
      field,
      code: 'invalid-range-number',
      message: '范围上下限必须是数字',
    })
    return
  }
  if (typeof strict !== 'boolean') {
    errors.push({
      field,
      code: 'invalid-range-mode',
      message: '范围配置第三项必须是布尔值',
    })
  }
  if (min > max) {
    errors.push({
      field,
      code: 'range-order-invalid',
      message: '范围下限不能大于上限',
    })
  }
}

export function validateConfigPatch(patch: Partial<FormData>): BossHelperAgentValidationError[] {
  const errors: BossHelperAgentValidationError[] = []

  if (patch.deliveryLimit != null) {
    const value = patch.deliveryLimit.value
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      errors.push({
        field: 'deliveryLimit.value',
        code: 'invalid-delivery-limit',
        message: 'deliveryLimit.value 必须是 1 到 1000 之间的整数',
      })
    }
  }

  if (patch.delay != null) {
    const delayEntries = Object.entries(patch.delay) as Array<[keyof FormData['delay'], number | undefined]>
    for (const [key, value] of delayEntries) {
      if (value == null) {
        continue
      }
      if (!isFiniteNumber(value) || value < 0) {
        errors.push({
          field: `delay.${key}`,
          code: 'invalid-delay-value',
          message: 'delay 字段必须是大于等于 0 的数字',
        })
      }
    }
  }

  if (patch.salaryRange != null) {
    if (patch.salaryRange.value != null) {
      validateRangeValue('salaryRange.value', patch.salaryRange.value, errors)
    }
    if (patch.salaryRange.advancedValue != null) {
      const advancedEntries = Object.entries(patch.salaryRange.advancedValue) as Array<
        [keyof FormData['salaryRange']['advancedValue'], FormDataRange | undefined]
      >
      for (const [key, value] of advancedEntries) {
        if (value == null) {
          continue
        }
        validateRangeValue(`salaryRange.advancedValue.${key}`, value, errors)
      }
    }
  }

  if (patch.companySizeRange?.value != null) {
    validateRangeValue('companySizeRange.value', patch.companySizeRange.value, errors)
  }

  if (patch.aiFiltering?.score != null) {
    const { score } = patch.aiFiltering
    if (!isFiniteNumber(score) || score < 0 || score > 100) {
      errors.push({
        field: 'aiFiltering.score',
        code: 'invalid-ai-filter-score',
        message: 'aiFiltering.score 必须是 0 到 100 之间的数字',
      })
    }
  }

  if (patch.aiFiltering?.externalTimeoutMs != null) {
    const { externalTimeoutMs } = patch.aiFiltering
    if (!isFiniteNumber(externalTimeoutMs) || externalTimeoutMs < 1000) {
      errors.push({
        field: 'aiFiltering.externalTimeoutMs',
        code: 'invalid-ai-filter-timeout',
        message: 'aiFiltering.externalTimeoutMs 必须是不小于 1000 的数字',
      })
    }
  }

  return errors
}