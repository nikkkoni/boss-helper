import type { FormData, PersistedFormData } from '@/types/formData'
import { jsonClone } from '@/utils/deepmerge'

export const formDataKey = 'local:web-geek-job-FormData'
export const formDataTemplatesKey = 'local:web-geek-job-FormDataTemplates'
export const legacySignedKeyStorageKeys = [
  'session:signedKey',
  'session:signedKeyInfo',
  'sync:signedKey',
  'sync:signedKeyInfo',
] as const
export const removedSensitiveStorageKeys = [
  'session:web-geek-job-AmapKey',
  'sync:web-geek-job-AmapKey',
] as const

export function stripRemovedConfigFields(data: PersistedFormData) {
  const snapshot = jsonClone(data) as Partial<FormData> & {
    aiFiltering?: FormData['aiFiltering'] & { vip?: boolean }
    aiGreeting?: FormData['aiGreeting'] & { vip?: boolean }
    aiReply?: { vip?: boolean }
    delay?: FormData['delay'] & { messageSending?: number }
    amap?: unknown
  }

  delete snapshot.amap
  delete snapshot.aiReply
  if (snapshot.aiFiltering) {
    delete snapshot.aiFiltering.vip
  }
  if (snapshot.aiGreeting) {
    delete snapshot.aiGreeting.vip
  }
  if (snapshot.delay) {
    delete snapshot.delay.messageSending
  }

  return snapshot as Partial<FormData>
}

export function sanitizeSensitiveFormData(data: PersistedFormData) {
  const snapshot = stripRemovedConfigFields(data)
  delete snapshot.userId
  return snapshot
}
