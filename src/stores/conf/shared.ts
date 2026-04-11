import type { FormData } from '@/types/formData'
import { jsonClone } from '@/utils/deepmerge'

export const formDataKey = 'local:web-geek-job-FormData'
export const formDataTemplatesKey = 'local:web-geek-job-FormDataTemplates'
export const amapKeyStorageKey = 'session:web-geek-job-AmapKey'
export const legacyAmapKeyStorageKey = 'sync:web-geek-job-AmapKey'

export function sanitizeSensitiveFormData(data: Partial<FormData>) {
  const snapshot = jsonClone(data)
  delete snapshot.userId
  if (snapshot.amap) {
    snapshot.amap.key = ''
  }
  return snapshot
}
