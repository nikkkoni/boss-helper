<script lang="ts" setup>
import { computed } from 'vue'

import type { llms } from '@/composables/useModel'
import type { LlmInfoVal } from '@/composables/useModel/type'
import { htmlToText } from '@/utils/safeHtml'

import LLMFormItem from './LLMFormItem.vue'

const props = defineProps<{
  data: (typeof llms)[number]
}>()
const formData = defineModel<Record<string, unknown>>({ required: true })
const formEntries = computed(() => Object.entries(props.data))
</script>

<template>
  <template v-for="[key, item] in formEntries" :key="key">
    <div v-if="'mode' in item" style="margin: 5px 0 20px 0">
      <h3 class="llm-form-desc">{{ htmlToText(item.desc) }}</h3>
    </div>
    <LLMFormItem
      v-else
      v-model="formData[key]"
      :label="key"
      :value="item as LlmInfoVal<unknown, { required: boolean }>"
    />
  </template>
</template>

<style lang="scss" scoped>
.llm-form-desc {
  font-size: 16px;
  margin-bottom: 10px;
  user-select: text;
  white-space: pre-line;
}
</style>
