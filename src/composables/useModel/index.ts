import { ElMessage } from 'element-plus'
import { defineStore } from 'pinia'
import { ref, toRaw, watch } from 'vue'

import { counter } from '@/message'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'
import { migrateStorageKeys } from '@/utils/storageMigration'

import type { openaiLLMConf } from './openai'
import { openai } from './openai'
import type { Llm, Prompt } from './type'

export const confModelKey = 'conf-model'
const persistedConfModelKey = `local:${confModelKey}`
const legacyConfModelKey = 'sync:conf-model'
const modelStorageMigrations = [
  { oldKey: legacyConfModelKey, newKey: persistedConfModelKey },
  { oldKey: 'session:conf-model', newKey: persistedConfModelKey },
] as const
export const llms = [openai.info]
export const llmIcon = llms.reduce(
  (acc, cur) => {
    if (cur.mode.icon != null) acc[cur.mode.mode] = cur.mode.icon
    return acc
  },
  {} as Record<string, string>,
)

export interface modelData {
  key: string
  name: string
  color?: string
  data?: openaiLLMConf
}

export function sortModelEntries(items: modelData[]) {
  return [...items]
}

export const useModel = defineStore('model', () => {
  const modelData = ref<modelData[]>([])

  watch(
    modelData,
    (items) => {
      const sorted = sortModelEntries(items.map((item) => toRaw(item)))
      if (sorted.every((item, index) => item === toRaw(items[index]))) {
        return
      }

      modelData.value = sorted
    },
    { deep: true, flush: 'sync' },
  )

  async function init() {
    await migrateStorageKeys(modelStorageMigrations, counter)
    const data = await counter.storageGet<modelData[]>(persistedConfModelKey)
    logger.debug('ai模型数据', data)
    modelData.value = data ?? []
  }

  function getModel(
    model: modelData | undefined,
    template: string | Prompt,
  ): Llm {
    if (!model?.data) {
      throw new Error('GPT数据不存在')
    }
    if (Array.isArray(template)) {
      template = jsonClone(template)
    }
    try {
      if (model.data) {
        return new openai.Gpt(model.data, template)
      }
      throw new Error('无GPT模型')
    } catch (error) {
      throw new Error(`GPT构建错误, ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function save() {
    await counter.storageSet(persistedConfModelKey, toRaw(modelData.value))
    ElMessage.success('保存成功')
  }

  return {
    initModel: init,
    modelData,
    saveModel: save,
    getModel,
    llmIcon,
  }
})
