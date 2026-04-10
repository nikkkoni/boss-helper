import type { Ref } from 'vue'
import { ref, toValue } from 'vue'

import {
  DOM_READY_TIMEOUT_MS,
  SELECTOR_TIMEOUT_MS,
  getActiveSelectorRegistry,
  splitSelectors,
  waitForDocumentReady,
} from '@/utils/selectors'

export type VueRouteLike = {
  path: string
}

export type VueRootInstance = Record<string, unknown> & {
  $route?: VueRouteLike
  $router?: {
    afterHooks?: Array<(route: VueRouteLike) => void | Promise<void>>
  }
  $store?: {
    state?: unknown
  }
}

const rootVue = ref<VueRootInstance>()
let rootSelector = ''
type VueHostElement = Element & {
  __vue__?: VueRootInstance
}

type SelectorInput = string | readonly string[]

type WaitForValueOptions = {
  debugLabel: string
  errorMessage: string
  intervalMs: number
  retries?: number
  selectors?: SelectorInput
  timeoutMs: number
}

function describeLookup(selectors?: SelectorInput) {
  const selectorList = selectors ? splitSelectors(selectors) : []
  const matchedSelectors = selectorList.filter((selector: string) => Boolean(document.querySelector(selector)))
  return {
    matchedSelectors,
    readyState: document.readyState,
    selectors: selectorList,
  }
}

function buildLookupError(
  options: WaitForValueOptions,
  attempts: number,
  cause: unknown,
) {
  const lookup = describeLookup(options.selectors)
  const selectorSummary = lookup.selectors.join(' | ') || 'n/a'
  const matchedSummary = lookup.matchedSelectors.join(' | ') || 'none'
  const detail = `${options.errorMessage} (${options.debugLabel}; attempts=${attempts}; readyState=${lookup.readyState}; selectors=${selectorSummary}; matched=${matchedSummary})`
  return new Error(detail, {
    cause: cause instanceof Error ? cause : undefined,
  })
}

function waitForValueOnce<T>(
  getter: () => T | null | undefined,
  errorMessage: string,
  intervalMs: number,
  timeoutMs: number,
) {
  return new Promise<T>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }

    const finish = (callback: () => void) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      callback()
    }

    const interval = setInterval(() => {
      try {
        const value = getter()
        if (value != null) {
          finish(() => resolve(value))
        }
      } catch (error) {
        finish(() => reject(error))
      }
    }, intervalMs)

    const timeout = setTimeout(() => {
      finish(() => reject(new Error(errorMessage)))
    }, timeoutMs)
  })
}

function findPropertyDescriptor(target: object, key: string) {
  let current: object | null = target
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (descriptor) {
      return descriptor
    }
    current = Object.getPrototypeOf(current)
  }
  return undefined
}

async function waitForValue<T>(
  getter: () => T | null | undefined,
  options: WaitForValueOptions,
) {
  let lastError: unknown
  const retries = options.retries ?? 2

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await waitForValueOnce(
        getter,
        options.errorMessage,
        options.intervalMs,
        options.timeoutMs,
      )
    } catch (error) {
      lastError = error
    }
  }

  throw buildLookupError(options, retries, lastError)
}

async function waitForVueInstance(selectors: SelectorInput, debugLabel: string) {
  await waitForDocumentReady(DOM_READY_TIMEOUT_MS)
  const selectorList = splitSelectors(selectors)

  return waitForValue(
    () => {
      for (const selector of selectorList) {
        const vueInstance = document.querySelector<VueHostElement>(selector)?.__vue__
        if (vueInstance != null) {
          return vueInstance
        }
      }
    },
    {
      debugLabel,
      errorMessage: '未找到对应元素',
      intervalMs: 100,
      retries: 2,
      selectors: selectorList,
      timeoutMs: SELECTOR_TIMEOUT_MS,
    },
  )
}

export async function getRootVue(): Promise<VueRootInstance> {
  const selectors = getActiveSelectorRegistry()
  if (rootSelector !== selectors.root) {
    rootSelector = selectors.root
    rootVue.value = undefined
  }

  if (rootVue.value !== undefined) {
    return rootVue.value
  }

  await waitForDocumentReady(DOM_READY_TIMEOUT_MS)

  const waitVueMount = async () =>
    waitForValue(
      () => {
        const wrap = document.querySelector<VueHostElement>(selectors.root)
        if (rootVue.value !== undefined) {
          return rootVue.value
        }
        if (wrap && '__vue__' in wrap) {
          rootVue.value = wrap.__vue__
          return rootVue.value
        }
      },
      {
        debugLabel: 'root-vue',
        errorMessage: '未找到vue根组件',
        intervalMs: 300,
        retries: 2,
        selectors: [selectors.root],
        timeoutMs: SELECTOR_TIMEOUT_MS,
      },
    )

  await waitVueMount()
  if (rootVue.value == null) {
    throw new Error('未找到vue根组件')
  }
  return rootVue.value
}

export function useHookVueData<T = unknown>(
  selectors: SelectorInput,
  key: string,
  data: Ref<T>,
  update?: (val: T) => void,
) {
  return async () => {
    const jobVue = await waitForVueInstance(selectors, `vue-data:${key}`)

    data.value = jobVue[key] as T
    update?.(toValue(jobVue[key] as T))
    const descriptor = findPropertyDescriptor(jobVue, key)
    const originalSet = descriptor?.set
    const originalGet = descriptor?.get
    let currentValue = jobVue[key] as T
    Object.defineProperty(jobVue, key, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get() {
        return originalGet ? originalGet.call(this) : currentValue
      },
      set(val: T) {
        currentValue = val
        data.value = val
        update?.(val)
        if (typeof originalSet === 'function') {
          originalSet.call(this, val)
        }
      },
    })
  }
}

export function useHookVueFn<T extends (...args: never[]) => unknown = (...args: never[]) => unknown>(
  selectors: SelectorInput,
  key: string | string[],
) {
  return async () => {
    const jobVue = await waitForVueInstance(selectors, `vue-fn:${Array.isArray(key) ? key.join('|') : key}`)
    if (Array.isArray(key)) {
      for (const k of key) {
        if (jobVue[k]) {
          return jobVue[k] as T
        }
      }
      throw new Error(`未找到可用的Vue方法: ${key.join(', ')}`)
    }
    if (jobVue[key]) {
      return jobVue[key] as T
    }
    throw new Error(`未找到Vue方法: ${key}`)
  }
}
