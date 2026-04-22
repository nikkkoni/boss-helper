<script lang="ts" setup>
import { ElTooltip } from 'element-plus'
import { toRef } from 'vue'

import { useHelpOverlay } from '../../hooks/useHelpOverlay'

const props = defineProps<{
  rootElement: HTMLElement | null
  visible: boolean
}>()

const { helpContent, helpMaxWidth, overlayStyles, tooltipVisible, triggerRef } = useHelpOverlay({
  rootElement: toRef(props, 'rootElement'),
  visible: toRef(props, 'visible'),
})
</script>

<template>
  <div class="helper-help-overlay" :style="overlayStyles" />

  <ElTooltip :visible="tooltipVisible" :virtual-ref="triggerRef" placement="top">
    <template #content>
      <div :style="`width: auto;max-width:${helpMaxWidth};font-size:16px;line-height:1.6;`">
        {{ helpContent }}
      </div>
    </template>
  </ElTooltip>
</template>

<style lang="scss">
.helper-help-overlay {
  z-index: 999;
  position: fixed;
  pointer-events: none;
  border-width: 1px;
  border-radius: 18px;
  backdrop-filter: blur(var(--bh-help-overlay-blur));
  -webkit-backdrop-filter: blur(var(--bh-help-overlay-blur));
}
</style>
