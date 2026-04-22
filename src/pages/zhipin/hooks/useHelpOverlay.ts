import { useMouseInElement } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

type HelpAnchorRect = {
  x: number
  y: number
  width: number
  height: number
}

type UseHelpOverlayOptions = {
  rootElement: Ref<HTMLElement | null>
  visible: Ref<boolean>
}

export function useHelpOverlay({ rootElement, visible }: UseHelpOverlayOptions) {
  const helpContent = ref('鼠标移到对应元素查看提示')
  const currentHelpElement = shallowRef<HTMLElement | null>(null)
  const helpAnchorRect = ref<HelpAnchorRect>({ x: 0, y: 0, width: 0, height: 0 })
  const overlayStyles = ref<Record<string, string | number>>({
    display: 'none',
  })
  const { isOutside } = useMouseInElement(rootElement)

  let currentRootElement: HTMLElement | null = null

  const triggerRef = computed(() => ({
    getBoundingClientRect() {
      return DOMRect.fromRect(helpAnchorRect.value)
    },
  }))

  const helpMaxWidth = computed(() =>
    typeof overlayStyles.value.width === 'string' && overlayStyles.value.width
      ? overlayStyles.value.width
      : '320px',
  )

  const tooltipVisible = computed(
    () => visible.value && !isOutside.value && overlayStyles.value.display === 'block',
  )

  function hideHelpBox() {
    currentHelpElement.value = null
    overlayStyles.value = {
      display: 'none',
    }
    helpAnchorRect.value = { x: 0, y: 0, width: 0, height: 0 }
  }

  function findHelpTarget(dom: HTMLElement | null) {
    let current = dom
    while (current) {
      if (current.dataset.help) {
        return current
      }

      current = current.parentElement
    }

    return null
  }

  function updateHelpBox(target: HTMLElement | null) {
    if (!target) {
      hideHelpBox()
      return
    }

    const help = target.dataset.help
    if (help) {
      helpContent.value = help
    }

    const bounding = target.getBoundingClientRect()
    const styles = window.getComputedStyle(target)
    helpAnchorRect.value = {
      x: bounding.left + bounding.width / 2,
      y: bounding.top + bounding.height / 2,
      width: 0,
      height: 0,
    }
    overlayStyles.value = {
      width: `${bounding.width}px`,
      height: `${bounding.height}px`,
      left: `${bounding.left}px`,
      top: `${bounding.top}px`,
      display: 'block',
      backgroundColor: 'var(--bh-highlight-bg)',
      borderRadius: styles.borderRadius || '18px',
      boxShadow: 'inset 0 0 0 1px var(--bh-highlight-line)',
      transition: 'all 0.08s linear',
    }
  }

  function syncHelpTarget(target: EventTarget | null) {
    if (!visible.value || isOutside.value) {
      hideHelpBox()
      return
    }

    const nextTarget = target instanceof HTMLElement ? findHelpTarget(target) : null
    if (nextTarget === currentHelpElement.value) {
      return
    }

    currentHelpElement.value = nextTarget
    updateHelpBox(nextTarget)
  }

  function refreshHelpBox() {
    if (!visible.value || isOutside.value || currentHelpElement.value == null) {
      hideHelpBox()
      return
    }

    updateHelpBox(currentHelpElement.value)
  }

  function handleHelpMouseMove(event: MouseEvent) {
    syncHelpTarget(event.target)
  }

  function handleHelpMouseLeave() {
    hideHelpBox()
  }

  function unbindRootElement() {
    currentRootElement?.removeEventListener('mousemove', handleHelpMouseMove, true)
    currentRootElement?.removeEventListener('mouseleave', handleHelpMouseLeave, true)
    currentRootElement = null
  }

  function bindRootElement(element: HTMLElement | null) {
    if (currentRootElement === element) {
      return
    }

    unbindRootElement()
    currentRootElement = element
    currentRootElement?.addEventListener('mousemove', handleHelpMouseMove, true)
    currentRootElement?.addEventListener('mouseleave', handleHelpMouseLeave, true)
  }

  watch(
    rootElement,
    (element) => {
      bindRootElement(element)
      if (!element) {
        hideHelpBox()
      }
    },
    { immediate: true },
  )

  watch([visible, isOutside], ([nextVisible, outside]) => {
    if (!nextVisible || outside) {
      hideHelpBox()
      return
    }

    refreshHelpBox()
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', refreshHelpBox, true)
    window.addEventListener('resize', refreshHelpBox)
  }

  onBeforeUnmount(() => {
    unbindRootElement()
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', refreshHelpBox, true)
      window.removeEventListener('resize', refreshHelpBox)
    }
  })

  return {
    helpContent,
    helpMaxWidth,
    overlayStyles,
    tooltipVisible,
    triggerRef,
  }
}
