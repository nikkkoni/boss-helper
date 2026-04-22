<script lang="ts" setup>
import { ElInputNumber, ElButton } from 'element-plus'

type RangeValue = [number, number, boolean]

const props = withDefaults(
  defineProps<{
    value: RangeValue

    unit: string

    show: boolean

    step?: number

    width?: string

    controls?: boolean
  }>(),
  {
    controls: true,
  },
)

const emit = defineEmits<{
  'update:value': [value: RangeValue]
}>()

function emitValue(nextValue: RangeValue) {
  emit('update:value', nextValue)
}

function updateNumber(index: 0 | 1, nextValue: number | null | undefined) {
  const value = typeof nextValue === 'number' && Number.isFinite(nextValue) ? nextValue : props.value[index]
  const next: RangeValue = [...props.value]
  next[index] = value
  emitValue(next)
}

const handleToggle = () => {
  const next: RangeValue = [...props.value]
  next[2] = !next[2]
  emitValue(next)
}
</script>

<template>
  <div class="salary-range" :style="{ '--salary-range-input-width': props.width || '105px' }">
    <ElInputNumber
      class="salary-range__input"
      :model-value="props.value[0]"
      :controls="props.controls"
      controls-position="right"
      :min="0"
      :step="props.step"
      @update:model-value="(value) => updateNumber(0, value)"
    />
    <span class="salary-range__separator">-</span>
    <ElInputNumber
      class="salary-range__input"
      :model-value="props.value[1]"
      :controls="props.controls"
      controls-position="right"
      :min="0"
      :step="props.step"
      @update:model-value="(value) => updateNumber(1, value)"
    />
    <span class="salary-range__unit">{{ props.unit }}</span>

    <ElButton v-if="props.show" class="salary-range__toggle" size="small" @click="handleToggle">
      {{ props.value[2] ? '严格' : '宽松' }}
    </ElButton>
  </div>
</template>

<style lang="scss" scoped>
.salary-range {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.salary-range__input {
  flex: 1 1 var(--salary-range-input-width);
  width: var(--salary-range-input-width);
  max-width: 100%;
  min-width: 0;
}

.salary-range__separator,
.salary-range__unit {
  color: var(--bh-text-primary);
  white-space: nowrap;
}

.salary-range__toggle {
  flex: 0 0 auto;
}
</style>
