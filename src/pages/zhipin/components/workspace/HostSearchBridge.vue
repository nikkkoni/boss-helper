<script lang="ts" setup>
import { computed, ref } from 'vue'

const props = defineProps<{
  kind: 'jobs' | 'legacy' | 'recommend'
}>()

const mountRef = ref<HTMLElement | null>(null)

const bridgeCopy = computed(() => {
  if (props.kind === 'recommend') {
    return {
      title: 'Boss 原生搜索模块',
      description: '推荐页会直接接入 Boss 原生搜索容器，原有功能保持不变。',
    }
  }

  if (props.kind === 'jobs') {
    return {
      title: 'Boss 原生筛选模块',
      description: '新版职位页会整体接入 Boss 原生搜索块和筛选块，原有功能与交互保持不变。',
    }
  }

  return {
    title: 'Boss 原生搜索与条件模块',
    description: '经典职位页的搜索栏和条件块会接入这里，扫码入口会按原有逻辑移除。',
  }
})

function getMountElement() {
  return mountRef.value
}

defineExpose({
  getMountElement,
})
</script>

<template>
  <div
    class="workspace-host-search bh-glass-surface bh-glass-surface--nested"
    data-help="这里承载 Boss 页面原生的搜索与筛选模块，功能保持原样，仅调整到工作台中展示。"
  >
    <div class="workspace-host-search__header">
      <span class="bh-eyebrow">Host Bridge</span>
      <h3>{{ bridgeCopy.title }}</h3>
      <p>{{ bridgeCopy.description }}</p>
    </div>

    <div
      ref="mountRef"
      class="workspace-host-search__mount"
      data-help="这里展示从 Boss 原页面接入的搜索与筛选控件，交互行为与站点原生模块一致。"
    >
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.workspace-host-search,
.workspace-host-search.bh-glass-surface,
.workspace-host-search.bh-glass-surface.bh-glass-surface--nested {
  display: grid;
  gap: 16px;
  overflow: visible !important;
  padding: 18px;
}

.workspace-host-search__header {
  display: grid;
  gap: 8px;
}

.workspace-host-search__header h3 {
  margin: 0;
  font-size: 1.02rem;
}

.workspace-host-search__header p {
  margin: 0;
  color: var(--bh-text-secondary);
  line-height: 1.7;
}

.workspace-host-search__mount {
  position: relative;
  display: flex;
  min-height: 64px;
  flex-direction: column;
  gap: 14px;
  overflow: visible !important;
  isolation: isolate;
}
</style>
