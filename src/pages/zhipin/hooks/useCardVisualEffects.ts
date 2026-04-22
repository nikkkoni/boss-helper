import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useAppearanceConfig } from './useAppearanceConfig'

export function useCardVisualEffects() {
  const { conf, ready } = useAppearanceConfig()
  const blurEnabled = computed(() => conf.blurCard)
  const isTracking = ref(false)

  watch(
    blurEnabled,
    (enabled) => {
      if (!enabled) {
        isTracking.value = false
      }
    },
    { immediate: true },
  )

  const updatePointerHighlight = (event: MouseEvent, element: HTMLElement) => {
    if (!blurEnabled.value) {
      return
    }

    if (isTracking.value) {
      return
    }

    isTracking.value = true

    window.requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect()
      element.style.setProperty('--x', `${event.clientX - rect.left}px`)
      element.style.setProperty('--y', `${event.clientY - rect.top}px`)
      element.style.setProperty('--r', '130px')
      isTracking.value = false
    })
  }

  const clearPointerHighlight = (element: HTMLElement) => {
    element.style.setProperty('--r', '0px')
    isTracking.value = false
  }

  onBeforeUnmount(() => {
    isTracking.value = false
  })

  return {
    blurEnabled,
    ready,
    updatePointerHighlight,
    clearPointerHighlight,
  }
}
