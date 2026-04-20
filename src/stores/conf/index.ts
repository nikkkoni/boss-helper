import { reactiveComputed, watchThrottled } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { defineStore } from 'pinia'
import { reactive, ref, toRaw } from 'vue'

import { counter } from '@/message'
import { useUser } from '@/stores/user'
import type { ConfigLevel, FormData, PersistedFormData, RuntimeConfigPatch } from '@/types/formData'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { exportJson, ImportJsonCancelledError, importJson } from '@/utils/jsonImportExport'
import { logger } from '@/utils/logger'
import { migrateStorageKeys } from '@/utils/storageMigration'

import { registerUserConfigSnapshotGetter } from '../user'
import { defaultFormData } from './info'
import {
  amapKeyStorageKey,
  formDataKey,
  formDataTemplatesKey,
  legacySignedKeyStorageKeys,
  legacyAmapKeyStorageKey,
  stripRemovedConfigFields,
  sanitizeSensitiveFormData,
} from './shared'

export * from './info'
export * from './shared'

type FormDataTemplates = Record<string, PersistedFormData>
export type FormDataMigration = [string, (from: PersistedFormData) => PersistedFormData]
const confStorageMigrations = [
  { oldKey: legacyAmapKeyStorageKey, newKey: amapKeyStorageKey },
] as const

export const FORM_DATA_MIGRATIONS: readonly FormDataMigration[] = [
  [
    '20250826',
    (from) => {
      if (from.salaryRange && typeof from.salaryRange.value === 'string') {
        const [min, max] = (from.salaryRange.value as string).split('-').map(Number)
        from.salaryRange.value = [min, max, false]
      }
      if (from.companySizeRange && typeof from.companySizeRange.value === 'string') {
        const [min, max] = (from.companySizeRange.value as string).split('-').map(Number)
        from.companySizeRange.value = [min, max, false]
      }
      return from
    },
  ],
  [
    '20260417',
    (from) => {
      delete (from.aiFiltering as (Partial<FormData['aiFiltering']> & { vip?: boolean }) | undefined)?.vip
      delete (from.aiGreeting as { vip?: boolean } | undefined)?.vip
      delete (from.aiReply as { vip?: boolean } | undefined)?.vip
      return from
    },
  ],
]

export function applyFormDataMigrations(
  from: PersistedFormData,
  migrations: readonly FormDataMigration[] = FORM_DATA_MIGRATIONS,
) {
  for (const [version, migrate] of migrations) {
    if ((from?.version ?? '20240401') >= version) {
      continue
    }

    from = migrate(from)
    from.version = version
  }

  return from
}

export const useConf = defineStore('conf', () => {
  const formData: FormData = reactive(jsonClone(defaultFormData))
  const isLoaded = ref(false)
  const templateNames = ref<string[]>([])

  registerUserConfigSnapshotGetter(() => formData)

  async function formDataHandler(from: PersistedFormData) {
    try {
      from = applyFormDataMigrations(from)
      from = {
        ...from,
        ...stripRemovedConfigFields(from),
      }
      const user = useUser()
      const uid = user.getUserId()
      // eslint-disable-next-line eqeqeq
      if (uid != null && from.userId != null && from.userId != uid) {
        ElMessage.success('检测到当前页面账号已变化，已切换为当前账号配置作用域')
        from.userId = uid
      } else if (uid != null && from.userId == null) {
        from.userId = uid
      }
    } catch (err) {
      logger.error('用户配置初始化失败', err)
      ElMessage.error(`用户配置初始化失败: ${String(err)}`)
    }
    return from
  }

  async function init() {
    await migrateStorageKeys(confStorageMigrations, counter)
    let from = await counter.storageGet<PersistedFormData>(formDataKey, {})
    const legacyAmapKey = typeof from.amap?.key === 'string' ? from.amap.key.trim() : ''
    let sessionAmapKey = await counter.storageGet<string>(amapKeyStorageKey)

    if (legacyAmapKey) {
      if (!sessionAmapKey) {
        sessionAmapKey = legacyAmapKey
        await counter.storageSet(amapKeyStorageKey, sessionAmapKey)
      }
      from = sanitizeSensitiveFormData(from)
      await counter.storageSet(formDataKey, from)
    }

    await Promise.all(legacySignedKeyStorageKeys.map((key) => counter.storageRm(key)))

    from = (await formDataHandler(from)) ?? from
    const data = deepmerge<FormData>(defaultFormData, stripRemovedConfigFields(from))
    data.amap.key = sessionAmapKey ?? ''
    Object.assign(formData, data)
    await loadTemplates()
    isLoaded.value = true
  }

  function sanitizeTemplateData(data: PersistedFormData) {
    return sanitizeSensitiveFormData(data)
  }

  async function persistSensitiveFields(data: Pick<FormData, 'amap'>) {
    const amapKey = data.amap.key.trim()
    if (amapKey) {
      await counter.storageSet(amapKeyStorageKey, amapKey)
      return
    }
    await counter.storageRm(amapKeyStorageKey)
  }

  async function loadTemplates() {
    const templates = await counter.storageGet<FormDataTemplates>(formDataTemplatesKey, {})
    templateNames.value = Object.keys(templates).sort((left, right) => left.localeCompare(right))
    return templates
  }

  watchThrottled(
    formData,
    (v) => {
      logger.debug('formData改变', toRaw(v))
    },
    { throttle: 2000 },
  )

  async function confSaving() {
    const v = sanitizeSensitiveFormData(formData)
    try {
      await persistSensitiveFields(formData)
      await counter.storageSet(formDataKey, v)
      logger.debug('formData保存', v)
      ElMessage.success('保存成功，配置已热更新')
    } catch (error: unknown) {
      ElMessage.error(`保存失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function saveTemplate(name: string) {
    const templateName = name.trim()
    if (!templateName) {
      throw new Error('模板名称不能为空')
    }

    const templates = await loadTemplates()
    templates[templateName] = sanitizeTemplateData(formData)
    await counter.storageSet(formDataTemplatesKey, templates)
    templateNames.value = Object.keys(templates).sort((left, right) => left.localeCompare(right))
    logger.debug('formData模板已保存', templateName)
    ElMessage.success(`模板已保存: ${templateName}`)
  }

  async function applyTemplate(name: string) {
    const templates = await counter.storageGet<FormDataTemplates>(formDataTemplatesKey, {})
    const template = templates[name]
    if (!template) {
      throw new Error('模板不存在')
    }

    const nextFormData = deepmerge<FormData>(
      jsonClone(defaultFormData),
      stripRemovedConfigFields(template),
      { clone: false },
    )
    nextFormData.amap.key = (await counter.storageGet<string>(amapKeyStorageKey)) ?? ''
    deepmerge(formData, nextFormData, { clone: false })
    logger.debug('formData模板已应用', name)
    ElMessage.success(`模板已应用: ${name}`)
  }

  async function deleteTemplate(name: string) {
    const templates = await counter.storageGet<FormDataTemplates>(formDataTemplatesKey, {})
    if (!(name in templates)) {
      throw new Error('模板不存在')
    }

    delete templates[name]
    await counter.storageSet(formDataTemplatesKey, templates)
    templateNames.value = Object.keys(templates).sort((left, right) => left.localeCompare(right))
    logger.debug('formData模板已删除', name)
    ElMessage.success(`模板已删除: ${name}`)
  }

  async function applyRuntimeConfigPatch(
    patch: RuntimeConfigPatch,
    options: { persist?: boolean } = {},
  ) {
    const sanitizedPatch = stripRemovedConfigFields(jsonClone(patch))
    delete sanitizedPatch.userId
    delete sanitizedPatch.version

    deepmerge(formData, sanitizedPatch, { clone: false })
    logger.debug('formData运行时更新', sanitizedPatch)

    if (options.persist) {
      await persistSensitiveFields(formData)
      await counter.storageSet(formDataKey, sanitizeSensitiveFormData(formData))
      logger.debug('formData运行时更新已持久化')
    }

    return jsonClone(formData)
  }

  function getRuntimeConfigSnapshot() {
    return jsonClone(formData)
  }

  async function confReload() {
    const v = deepmerge<FormData>(
      defaultFormData,
      stripRemovedConfigFields(await counter.storageGet<PersistedFormData>(formDataKey, {})),
    )
    v.amap.key = (await counter.storageGet<string>(amapKeyStorageKey)) ?? ''
    deepmerge(formData, v, { clone: false })
    logger.debug('formData已重置')
    ElMessage.success('重置成功')
  }

  async function confExport() {
    const data = deepmerge<FormData>(
      defaultFormData,
      stripRemovedConfigFields(await counter.storageGet<PersistedFormData>(formDataKey, {})),
    )
    data.amap.key = ''
    exportJson(data, '投递配置')
  }

  async function confImport() {
    try {
      let jsonData = await importJson<PersistedFormData>()

      jsonData.userId = undefined
      if (typeof jsonData.amap?.key === 'string' && jsonData.amap.key.trim()) {
        await counter.storageSet(amapKeyStorageKey, jsonData.amap.key.trim())
      }
      jsonData = (await formDataHandler(jsonData)) ?? jsonData
      const nextFormData = deepmerge<FormData>(
        jsonClone(defaultFormData),
        stripRemovedConfigFields(jsonData),
        { clone: false },
      )
      nextFormData.amap.key = (await counter.storageGet<string>(amapKeyStorageKey)) ?? ''
      deepmerge(formData, nextFormData, { clone: false })
      await persistSensitiveFields(formData)
      await counter.storageSet(formDataKey, sanitizeSensitiveFormData(formData))
      ElMessage.success('导入成功，配置已热更新')
    } catch (error) {
      if (error instanceof ImportJsonCancelledError) {
        return
      }
      ElMessage.error(error instanceof Error ? error.message : '导入失败')
    }
  }

  function confRecommend() {
    const recommendedDefaults = Object.fromEntries(
      [
        'deliveryLimit',
        'activityFilter',
        'friendStatus',
        'sameCompanyFilter',
        'sameHrFilter',
        'goldHunterFilter',
        'notification',
        'useCache',
        'delay',
      ].map((key) => [key, jsonClone(defaultFormData[key as keyof FormData])]),
    )

    Object.assign(formData, recommendedDefaults)
    logger.debug('formData推荐配置已应用')
    ElMessage.success('推荐配置已应用, 不会自动保存, 请手动保存或重载恢复')
  }

  function confDelete() {
    Object.assign(formData, jsonClone(defaultFormData))
    logger.debug('formData已清空')
    ElMessage.success('配置清空成功, 不会自动保存, 请手动保存或重载恢复')
  }

  const order: Record<ConfigLevel, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4,
  }

  const config_level = reactiveComputed(() => {
    const val = order[formData.config_level]
    return {
      intermediate: order['intermediate'] <= val,
      advanced: order['advanced'] <= val,
      expert: order['expert'] <= val,
    }
  })

  return {
    confInit: init,
    confSaving,
    confReload,
    confExport,
    confImport,
    confDelete,
    confRecommend,
    saveTemplate,
    applyTemplate,
    deleteTemplate,
    loadTemplates,
    applyRuntimeConfigPatch,
    getRuntimeConfigSnapshot,
    formDataKey,
    formDataTemplatesKey,
    defaultFormData,
    formData,
    isLoaded,
    templateNames,
    config_level,
  }
})

if (import.meta.env.DEV) {
  window.__q_useConf = useConf
}
