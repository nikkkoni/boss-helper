import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useConf } from '@/stores/conf'
import { useStatistics } from '@/stores/statistics'

import { useAppearanceConfig } from './useAppearanceConfig'

const customFaviconHref = 'https://onlinecalculator.cc/public/favicon.svg'
const dynamicTitleSuffix = '在线计算器'

type ElementStyleState = {
  element: HTMLElement
  originalValue: string
  property: string
}

type FaviconState = {
  created: boolean
  link: HTMLLinkElement
  originalHref: string | null
}

function restoreInlineStyle(state: ElementStyleState | null) {
  if (!state) {
    return null
  }

  if (state.originalValue) {
    state.element.style.setProperty(state.property, state.originalValue)
  } else {
    state.element.style.removeProperty(state.property)
  }

  return null
}

function syncInlineStyle(
  state: ElementStyleState | null,
  elementId: string,
  property: string,
  value: string | null,
) {
  const element = document.getElementById(elementId)

  if (!element) {
    return state
  }

  if (state && (state.element !== element || state.property !== property)) {
    restoreInlineStyle(state)
    state = null
  }

  const nextState =
    state && state.element === element && state.property === property
      ? state
      : {
          element,
          originalValue: element.style.getPropertyValue(property),
          property,
        }

  if (value == null) {
    if (nextState.originalValue) {
      element.style.setProperty(property, nextState.originalValue)
    } else {
      element.style.removeProperty(property)
    }
  } else {
    element.style.setProperty(property, value)
  }

  return nextState
}

function getFaviconLink() {
  return document.head.querySelector<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"]')
}

export function useAppearanceEffects() {
  const { conf, ready } = useAppearanceConfig()
  const { formData } = useConf()
  const { todayData } = useStatistics()
  const readyState = ref(false)

  let disposed = false
  let headerState: ElementStyleState | null = null
  let listSinkState: ElementStyleState | null = null
  let faviconState: FaviconState | null = null
  let originalTitle: string | null = null

  function syncHeaderEffect() {
    headerState = syncInlineStyle(headerState, 'header', 'display', conf.hideHeader ? 'none' : null)
  }

  function syncListSinkEffect() {
    listSinkState = syncInlineStyle(
      listSinkState,
      'boss-helper-job-wrap',
      'margin-bottom',
      conf.listSink ? '300px' : null,
    )
  }

  function applyDynamicTitle() {
    if (originalTitle == null) {
      originalTitle = document.title
    }

    document.title = `${todayData.success}/${formData.deliveryLimit.value} - ${dynamicTitleSuffix}`
  }

  function restoreDynamicTitle() {
    if (originalTitle == null) {
      return
    }

    document.title = originalTitle
    originalTitle = null
  }

  function applyCustomFavicon() {
    if (!faviconState) {
      const existingLink = getFaviconLink()

      if (existingLink) {
        faviconState = {
          created: false,
          link: existingLink,
          originalHref: existingLink.getAttribute('href'),
        }
      } else {
        const link = document.createElement('link')
        link.setAttribute('rel', 'icon')
        document.head.appendChild(link)
        faviconState = {
          created: true,
          link,
          originalHref: null,
        }
      }
    }

    faviconState.link.setAttribute('href', customFaviconHref)
  }

  function restoreCustomFavicon() {
    if (!faviconState) {
      return
    }

    if (faviconState.created) {
      faviconState.link.remove()
    } else if (faviconState.originalHref) {
      faviconState.link.setAttribute('href', faviconState.originalHref)
    } else {
      faviconState.link.removeAttribute('href')
    }

    faviconState = null
  }

  watch(
    [readyState, () => conf.hideHeader],
    ([isReady, hideHeader]) => {
      if (!isReady) {
        return
      }

      void hideHeader
      syncHeaderEffect()
    },
    { immediate: true },
  )

  watch(
    [readyState, () => conf.listSink],
    ([isReady, listSink]) => {
      if (!isReady) {
        return
      }

      void listSink
      syncListSinkEffect()
    },
    { immediate: true },
  )

  watch(
    [readyState, () => conf.dynamicTitle, () => todayData.success, () => formData.deliveryLimit.value],
    ([isReady, dynamicTitle]) => {
      if (!isReady) {
        return
      }

      if (dynamicTitle) {
        applyDynamicTitle()
        return
      }

      restoreDynamicTitle()
    },
    { immediate: true },
  )

  watch(
    [readyState, () => conf.changeIcon],
    ([isReady, changeIcon]) => {
      if (!isReady) {
        return
      }

      if (changeIcon) {
        applyCustomFavicon()
        return
      }

      restoreCustomFavicon()
    },
    { immediate: true },
  )

  onMounted(async () => {
    await ready

    if (disposed) {
      return
    }

    readyState.value = true
    syncHeaderEffect()
    syncListSinkEffect()
  })

  onBeforeUnmount(() => {
    disposed = true
    readyState.value = false
    headerState = restoreInlineStyle(headerState)
    listSinkState = restoreInlineStyle(listSinkState)
    restoreDynamicTitle()
    restoreCustomFavicon()
  })
}
