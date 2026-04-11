import { ElMessage } from 'element-plus'
import { defineStore } from 'pinia'
import { ref, toRaw, watch } from 'vue'

import { counter } from '@/message'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'
import { migrateStorageKeys } from '@/utils/storageMigration'

import type { openaiLLMConf } from './openai'
import { openai } from './openai'
import { SignedKeyLLM } from './signedKey'
import type { Llm, Prompt } from './type'

export const confModelKey = 'conf-model'
const sessionConfModelKey = 'session:conf-model'
const legacyConfModelKey = 'sync:conf-model'
const modelStorageMigrations = [
  { oldKey: legacyConfModelKey, newKey: sessionConfModelKey },
] as const
export const llms = [openai.info]
export const llmIcon = llms.reduce(
  (acc, cur) => {
    if (cur.mode.icon != null) acc[cur.mode.mode] = cur.mode.icon
    return acc
  },
  {
    vip: `<svg t="1742123680044" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2637" width="22" height="22"><path d="M60.235294 361.411765l744.809412 425.622588A30.117647 30.117647 0 0 1 790.136471 843.294118H173.658353a60.235294 60.235294 0 0 1-59.783529-52.766118L60.235294 361.411765z" fill="#F5C164" p-id="2638" /><path d="M963.764706 361.411765l-53.63953 429.116235A60.235294 60.235294 0 0 1 850.341647 843.294118H233.893647a30.117647 30.117647 0 0 1-14.968471-56.259765L963.764706 361.411765z" fill="#F5C164" p-id="2639" /><path d="M512 240.941176l331.053176 509.289412A60.235294 60.235294 0 0 1 792.545882 843.294118H231.454118a60.235294 60.235294 0 0 1-50.507294-93.06353L512 240.941176z" fill="#FFE09E" p-id="2640" /><path d="M512 240.941176l331.053176 509.289412A60.235294 60.235294 0 0 1 792.545882 843.294118H512V240.941176z" fill="#F9CF7E" p-id="2641" /><path d="M512 210.823529m-60.235294 0a60.235294 60.235294 0 1 0 120.470588 0 60.235294 60.235294 0 1 0-120.470588 0Z" fill="#FFE19F" p-id="2642" /><path d="M963.764706 331.294118m-60.235294 0a60.235294 60.235294 0 1 0 120.470588 0 60.235294 60.235294 0 1 0-120.470588 0Z" fill="#FFE19F" p-id="2643" /><path d="M60.235294 331.294118m-60.235294 0a60.235294 60.235294 0 1 0 120.470588 0 60.235294 60.235294 0 1 0-120.470588 0Z" fill="#FFE19F" p-id="2644" /></svg>`,
  } as Record<string, string>,
)

export interface modelData {
  key: string
  name: string
  color?: string
  data?: openaiLLMConf
  vip?: {
    description: string
    price: {
      input: string
      output: string
    }
  }
}

function compareModelData(left: modelData, right: modelData) {
  if (left.vip == null && right.vip != null) {
    return 1
  }
  if (left.vip != null && right.vip == null) {
    return -1
  }
  return 0
}

export function sortModelEntries(items: modelData[]) {
  return [...items].sort(compareModelData)
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
    const data = await counter.storageGet<modelData[]>(sessionConfModelKey)
    logger.debug('ai模型数据', data)
    const persistedModels = data ?? []
    const vipModels = modelData.value.filter((item) => item.vip != null)

    modelData.value = [
      ...persistedModels,
      ...vipModels.filter((item) => !persistedModels.some((stored) => stored.key === item.key)),
    ]
  }

  function getModel(
    model: modelData | undefined,
    template: string | Prompt,
    vip = false,
  ): Llm | SignedKeyLLM {
    if (vip) {
      if (typeof template === 'string') {
        const llm = new SignedKeyLLM(template)
        void llm.checkResume().catch((error) => {
          logger.warn('VIP模型简历检查失败', {
            error: error instanceof Error ? error.message : String(error),
          })
        })
        return llm
      } else {
        throw new TypeError('VIP模型必须传入字符串')
      }
    }
    if (!model?.data && !model?.vip) {
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
    await counter.storageSet(
      sessionConfModelKey,
      toRaw(modelData.value).filter((item) => item.vip == null),
    )
    ElMessage.success('保存成功')
  }

  return {
    initModel: init,
    modelData,
    saveModel: save,
    getModel,
    SignedKeyLLM,
    llmIcon,
  }
})
