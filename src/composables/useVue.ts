import type { Ref } from 'vue'
import { ref, toValue } from 'vue'

const rootVue = ref()

function waitForValue<T>(
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

export async function getRootVue(): Promise<any> {
  if (rootVue.value !== undefined) {
    return rootVue.value
  }

  const waitVueMount = async () =>
    waitForValue(() => {
      const wrap = document.querySelector('#wrap')
      if (rootVue.value !== undefined) {
        return rootVue.value
      }
      if (wrap && '__vue__' in wrap) {
        rootVue.value = wrap.__vue__
        return rootVue.value
      }
    }, '未找到vue根组件', 300, 20000)

  await waitVueMount()
  return rootVue.value
}

export function useHookVueData<T = any>(
  selectors: string,
  key: string,
  data: Ref<T>,
  update?: (val: T) => void,
) {
  return async () => {
    const jobVue = await waitForValue(
      () => document.querySelector<any>(selectors)?.__vue__,
      '未找到对应元素',
      100,
      20000,
    )

    data.value = jobVue[key]
    update?.(toValue(jobVue[key] as T))
    // eslint-disable-next-line no-restricted-properties
    const originalSet = jobVue.__lookupSetter__(key)
    // eslint-disable-next-line accessor-pairs
    Object.defineProperty(jobVue, key, {
      set(val: T) {
        data.value = val
        update?.(val)
        originalSet.call(this, val)
      },
    })
  }
}

export function useHookVueFn(selectors: string, key: string | string[]) {
  return async () => {
    const jobVue = await waitForValue(
      () => document.querySelector<any>(selectors)?.__vue__,
      '未找到对应元素',
      100,
      20000,
    )
    if (Array.isArray(key)) {
      for (const k of key) {
        if (jobVue[k]) {
          return jobVue[k]
        }
      }
    } else {
      return jobVue[key]
    }
  }
}
