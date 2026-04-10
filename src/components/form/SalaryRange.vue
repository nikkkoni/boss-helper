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
  <div style="display: flex; flex: 1; justify-content: space-between; align-items: center">
    <ElInputNumber
      :model-value="props.value[0]"
      :style="`width: ${props.width || '105px'};`"
      :controls="props.controls"
      controls-position="right"
      :min="0"
      :step="props.step"
      @update:model-value="(value) => updateNumber(0, value)"
    />
    <span>-</span>
    <ElInputNumber
      :model-value="props.value[1]"
      :style="`width: ${props.width || '105px'};`"
      :controls="props.controls"
      controls-position="right"
      :min="0"
      :step="props.step"
      @update:model-value="(value) => updateNumber(1, value)"
    />
    <span>{{ props.unit }}</span>

    <ElButton v-if="props.show" size="small" @click="handleToggle">
      {{ props.value[2] ? '严格' : '宽松' }}
    </ElButton>
  </div>
</template>

<style lang="scss" scoped></style>
