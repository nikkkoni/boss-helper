export const runDeliveryGuardrailCode = 'run-delivery-limit-reached'
export const runDeliveryGuardrailLimit = 20
export const runDeliveryGuardrailSource = 'run-delivery-limit'

export function getRunDeliveredCount(run: { deliveredJobIds?: string[] | null } | null | undefined) {
  if (!Array.isArray(run?.deliveredJobIds) || run.deliveredJobIds.length === 0) {
    return 0
  }

  return [...new Set(run.deliveredJobIds.map((jobId) => String(jobId).trim()).filter(Boolean))].length
}
