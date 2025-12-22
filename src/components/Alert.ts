import type { AlertProps } from 'element-plus'
import type { VNode } from 'vue'
import { alertProps, ElAlert } from 'element-plus'
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { counter } from '@/message'

export interface ExtendedAlertProps extends AlertProps {
  id: string
}

export default defineComponent({
  name: 'Alert',
  props: {
    ...alertProps,
    id: {
      type: String,
      required: true,
    },
  },

  setup(props: ExtendedAlertProps, { slots }): () => VNode | null {
    const storageKey = computed(() => `local:alert:${props.id}`)
    const isVisible = ref(true)

    onMounted(async () => {
      const shouldHide = await counter.storageGet(storageKey.value, false)
      isVisible.value = !shouldHide
    })

    const handleClose = async () => {
      await counter.storageSet(storageKey.value, true)
      isVisible.value = false
    }

    return () => isVisible.value
      ? h(ElAlert, {
          ...props,
          onClose: handleClose,
        }, slots)
      : null
  },
})
