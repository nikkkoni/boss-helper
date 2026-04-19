import type { FormData, PersistedFormData } from '@/types/formData'
import { jsonClone } from '@/utils/deepmerge'

export const formDataKey = 'local:web-geek-job-FormData'
export const formDataTemplatesKey = 'local:web-geek-job-FormDataTemplates'
export const amapKeyStorageKey = 'session:web-geek-job-AmapKey'
export const legacyAmapKeyStorageKey = 'sync:web-geek-job-AmapKey'
export const legacySignedKeyStorageKeys = [
  'session:signedKey',
  'session:signedKeyInfo',
  'sync:signedKey',
  'sync:signedKeyInfo',
] as const

export function stripRemovedConfigFields(data: PersistedFormData) {
  const snapshot = jsonClone(data)
  delete snapshot.customGreeting
  delete snapshot.greetingVariable
  delete snapshot.aiGreeting
  delete snapshot.aiReply
  if (snapshot.aiFiltering) {
    delete (snapshot.aiFiltering as FormData['aiFiltering'] & { vip?: boolean }).vip
  }
  if (snapshot.delay) {
    delete (snapshot.delay as { messageSending?: number }).messageSending
  }

  return snapshot as Partial<FormData>
}

export function sanitizeSensitiveFormData(data: PersistedFormData) {
  const snapshot = stripRemovedConfigFields(data)
  delete snapshot.userId
  if (snapshot.amap) {
    snapshot.amap.key = ''
  }
  return snapshot
}
