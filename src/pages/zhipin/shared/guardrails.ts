export const deliveryLimitGuardrailCode = 'delivery-limit-reached'
export const deliveryLimitGuardrailSource = 'delivery-limit'
export const runDeliveryGuardrailCode = 'run-delivery-limit-reached'
export const runDeliveryGuardrailLimit = 20
export const runDeliveryGuardrailSource = 'run-delivery-limit'

function toNonNegativeInteger(value: unknown) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.trunc(Number(value)))
}

export function isDeliveryLimitReached(limit: unknown, usedToday: unknown) {
  const normalizedLimit = toNonNegativeInteger(limit)
  const normalizedUsedToday = toNonNegativeInteger(usedToday)

  return normalizedLimit > 0 && normalizedUsedToday >= normalizedLimit
}

export function getRunDeliveredCount(run: { deliveredJobIds?: string[] | null } | null | undefined) {
  if (!Array.isArray(run?.deliveredJobIds) || run.deliveredJobIds.length === 0) {
    return 0
  }

  return [...new Set(run.deliveredJobIds.map((jobId) => String(jobId).trim()).filter(Boolean))].length
}
