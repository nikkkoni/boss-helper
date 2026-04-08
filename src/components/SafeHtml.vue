<script lang="ts" setup>
import { computed } from 'vue'

import { sanitizeRichHtml, sanitizeSvgHtml } from '@/utils/safeHtml'

const props = withDefaults(
  defineProps<{
    html?: string | null
    tag?: string
    variant?: 'html' | 'svg'
  }>(),
  {
    html: '',
    tag: 'span',
    variant: 'html',
  },
)

const safeHtml = computed(() => {
  return props.variant === 'svg' ? sanitizeSvgHtml(props.html) : sanitizeRichHtml(props.html)
})
</script>

<template>
  <component :is="tag" v-html="safeHtml" />
</template>
