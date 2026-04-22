import { reactive, watch } from 'vue'

import { ExtStorage } from '@/message'

export interface AppearanceConfig {
  hideHeader: boolean
  changeIcon: boolean
  dynamicTitle: boolean
  changeBackground: boolean
  blurCard: boolean
  listSink: boolean
}

export const appearanceConfigStorageKey = 'appearance-conf'

export const defaultAppearanceConfig: AppearanceConfig = {
  hideHeader: false,
  changeIcon: false,
  dynamicTitle: false,
  changeBackground: false,
  blurCard: false,
  listSink: false,
}

const appearanceConfig = reactive<AppearanceConfig>({ ...defaultAppearanceConfig })

let appearanceConfigLoaded = false
let appearanceConfigLoadPromise: Promise<void> | null = null

async function loadAppearanceConfig() {
  const stored = await ExtStorage.getItem(appearanceConfigStorageKey)

  const normalizedStored =
    typeof stored === 'string'
      ? (() => {
          try {
            return JSON.parse(stored) as Partial<AppearanceConfig>
          } catch {
            return null
          }
        })()
      : stored

  if (normalizedStored && typeof normalizedStored === 'object' && !Array.isArray(normalizedStored)) {
    Object.assign(
      appearanceConfig,
      defaultAppearanceConfig,
      normalizedStored as Partial<AppearanceConfig>,
    )
  } else {
    Object.assign(appearanceConfig, defaultAppearanceConfig)
  }

  appearanceConfigLoaded = true
}

watch(
  appearanceConfig,
  (value) => {
    if (!appearanceConfigLoaded) {
      return
    }

    void ExtStorage.setItem(appearanceConfigStorageKey, JSON.stringify({ ...value }))
  },
  { deep: true },
)

export function useAppearanceConfig() {
  if (!appearanceConfigLoadPromise) {
    appearanceConfigLoadPromise = loadAppearanceConfig()
  }

  return {
    conf: appearanceConfig,
    ready: appearanceConfigLoadPromise,
  }
}

export function __resetAppearanceConfigStateForTests() {
  appearanceConfigLoaded = false
  appearanceConfigLoadPromise = null
  Object.assign(appearanceConfig, defaultAppearanceConfig)
}
