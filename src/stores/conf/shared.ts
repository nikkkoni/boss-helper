import type { FormData } from '@/types/formData'
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

export function sanitizeSensitiveFormData(data: Partial<FormData>) {
  const snapshot = jsonClone(data)
  delete snapshot.userId
  if (snapshot.aiGreeting) {
    delete (snapshot.aiGreeting as FormData['aiGreeting'] & { vip?: boolean }).vip
  }
  if (snapshot.aiFiltering) {
    delete (snapshot.aiFiltering as FormData['aiFiltering'] & { vip?: boolean }).vip
  }
  if (snapshot.aiReply) {
    delete (snapshot.aiReply as FormData['aiReply'] & { vip?: boolean }).vip
  }
  if (snapshot.amap) {
    snapshot.amap.key = ''
  }
  return snapshot
}
