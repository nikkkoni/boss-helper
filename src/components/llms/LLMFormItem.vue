<script lang="ts" setup>
import type { AlertProps } from 'element-plus'
import {
  ElAlert,
  ElFormItem,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElSelectV2,
  ElSlider,
  ElSwitch,
  ElText,
  ElTooltip,
} from 'element-plus'
import type { Component } from 'vue'
import { computed } from 'vue'

import Info from '@/components/icon/Info.vue'
import type { FormElm, LlmInfoVal } from '@/composables/useModel/type'
import { htmlToText } from '@/utils/safeHtml'

const props = defineProps<{
  value: LlmInfoVal<unknown, { required: boolean }>
  label: string | number | symbol
  depth?: number
}>()

const fromVal = defineModel<unknown>({ required: true })

function getComponent(elm: FormElm['type'] | undefined) {
  switch (elm) {
    case 'input':
      return { el: ElInput, defaultConf: { clearable: true } }
    case 'inputNumber':
      return { el: ElInputNumber, defaultConf: {} }
    case 'select':
      return { el: ElSelectV2, defaultConf: { options: [] } }
    case 'slider':
      return {
        el: ElSlider,
        defaultConf: { style: 'margin: 0 10px;', showInput: true },
      }
    case 'switch':
      return { el: ElSwitch, defaultConf: {} }
  }
  return { el: undefined, defaultConf: {} }
}

const { el, defaultConf } = getComponent(props.value.type) as {
  defaultConf: Record<string, unknown>
  el: Component | undefined
}
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

const nestedModel = computed<Record<string, unknown>>({
  get: () => (isObjectRecord(fromVal.value) ? fromVal.value : {}),
  set: (value) => {
    fromVal.value = value
  },
})
const componentModel = computed<string | number | boolean | Record<string, unknown> | undefined>({
  get: () => fromVal.value as string | number | boolean | Record<string, unknown> | undefined,
  set: (value) => {
    fromVal.value = value
  },
})
</script>

<template>
  <template v-if="value && 'alert' in value">
    <ElAlert
      :title="value.label || label.toString()"
      :description="htmlToText(value.desc)"
      :type="value.alert as NonNullable<AlertProps['type']>"
      :closable="false"
      show-icon
      :style="`margin: 10px 0px 20px ${(props.depth || 0) * 10}px;`"
    />
    <LLMFormItem
      v-for="(x, k) in value.value"
      :key="k"
      v-model="nestedModel[k]"
      :value="x"
      :label="k"
      :depth="(depth || 0) + 1"
    />
  </template>
  <ElFormItem
    v-else-if="value"
    :required="value.required"
    :style="`margin-left: ${(props.depth || 0) * 10}px;`"
  >
    <template #label>
      <ElText size="large">
        {{ value.label || label }}
      </ElText>
      <ElTooltip v-if="value.desc">
        <template #content>
          <div class="llm-form-tooltip">{{ htmlToText(value.desc) }}</div>
        </template>
        <ElIcon style="margin-left: 8px">
          <Info />
        </ElIcon>
      </ElTooltip>
    </template>
    <component :is="el" v-model="componentModel" v-bind="{ ...defaultConf, ...value.config }" />
  </ElFormItem>
</template>

<style scoped>
:deep(.ehp-input__wrapper) {
  width: 100%;
}

:deep(.ehp-slider .ehp-slider__input) {
  width: 200px !important;
}

.llm-form-tooltip {
  max-width: 320px;
  white-space: pre-line;
}
</style>
