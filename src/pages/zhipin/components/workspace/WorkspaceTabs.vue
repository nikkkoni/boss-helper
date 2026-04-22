<script lang="ts" setup>
import { ElTabPane, ElTabs } from 'element-plus'
import { computed, ref } from 'vue'

import HostSearchBridge from './HostSearchBridge.vue'

const props = defineProps<{
  modelValue: string
  searchPanelKind: 'jobs' | 'legacy' | 'recommend'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const tabsRootRef = ref<HTMLDivElement | null>(null)
type HostSearchBridgeExpose = {
  getMountElement: () => HTMLElement | null
}

const searchHostRef = ref<HostSearchBridgeExpose | null>(null)

const activeTab = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

function getTabsRootElement() {
  return tabsRootRef.value
}

function getSearchMountElement() {
  return searchHostRef.value?.getMountElement() ?? null
}

defineExpose({
  getSearchMountElement,
  getTabsRootElement,
})
</script>

<template>
  <div ref="tabsRootRef">
    <ElTabs v-model="activeTab" class="helper-tabs" data-help="帮助模式开启后，可在各个模块上悬停查看功能说明。">
      <ElTabPane label="统计概览" name="statistics" data-help="查看当前页面处理进度、今日统计和批处理控制。">
        <section class="helper-panel helper-panel--statistics">
          <slot name="statistics" />
        </section>
      </ElTabPane>

      <ElTabPane label="筛选条件" name="filter">
        <HostSearchBridge ref="searchHostRef" class="helper-search-pane" :kind="searchPanelKind">
          <slot name="filter" />
        </HostSearchBridge>
      </ElTabPane>

      <ElTabPane label="投递配置" name="config" data-help="集中管理筛选、投递、外观和 AI 相关配置。">
        <section class="helper-panel bh-glass-surface">
          <slot name="config" />
        </section>
      </ElTabPane>

      <ElTabPane label="运行日志" name="logs" data-help="查看运行记录、错误信息以及 AI 过滤详情。">
        <section class="helper-panel bh-glass-surface">
          <slot name="logs" />
        </section>
      </ElTabPane>

      <ElTabPane label="项目说明" name="about" class="hp-about-box" data-help="查看仓库、文档和当前项目的补充说明。">
        <section class="helper-panel helper-panel--about">
          <slot name="about" />
        </section>
      </ElTabPane>
    </ElTabs>
  </div>
</template>

<style lang="scss">
.helper-tabs .ehp-tabs__header {
  margin: 0;
  display: flex;
  justify-content: center;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.helper-tabs .ehp-tabs__nav-wrap {
  display: flex;
  justify-content: center;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.helper-tabs .ehp-tabs__nav-wrap::after {
  display: none;
}

.helper-tabs .ehp-tabs__nav-scroll {
  display: inline-flex;
  justify-content: center;
  width: auto;
  max-width: 100%;
  margin: 0 auto;
  padding: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bh-surface-pill);
  box-shadow: var(--bh-shadow-pill);
}

.helper-tabs .ehp-tabs__nav {
  width: auto;
  justify-content: center;
  margin: 0 auto;
  gap: 8px;
  border: 0;
}

.helper-tabs .ehp-tabs__nav-prev,
.helper-tabs .ehp-tabs__nav-next {
  display: none;
}

.helper-tabs .ehp-tabs__active-bar {
  display: none;
}

.helper-tabs .ehp-tabs__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 18px !important;
  border-radius: 999px;
  color: var(--bh-text-secondary);
  line-height: 1.1;
  text-align: center;
  font-weight: 600;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.helper-tabs .ehp-tabs__item.is-top:first-child,
.helper-tabs .ehp-tabs__item.is-top:nth-child(2),
.helper-tabs .ehp-tabs__item.is-top:last-child {
  padding-left: 18px !important;
  padding-right: 18px !important;
}

.helper-tabs .ehp-tabs__item.is-active {
  background: var(--bh-accent-gradient);
  color: #fff;
  box-shadow: var(--bh-shadow-accent);
}

.helper-tabs .ehp-tabs__item:hover {
  color: var(--bh-text-primary);
}

.helper-panel,
.helper-search-pane {
  margin-top: 18px;
  padding: 22px;
  border-radius: var(--bh-radius-panel-lg);
}

.helper-search-pane,
.helper-search-pane.workspace-host-search {
  min-height: 120px;
  overflow: visible !important;
}

.helper-tabs .ehp-tabs__content,
.helper-tabs .ehp-tab-pane {
  overflow: visible !important;
}

.helper-panel--statistics {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.helper-panel--about {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.hp-about-box {
  display: flex;
}

@media (max-width: 640px) {
  .helper-panel,
  .helper-search-pane {
    padding: 18px;
    border-radius: 22px;
  }

  .helper-panel--statistics {
    padding: 0;
    border-radius: 0;
  }

  .helper-tabs .ehp-tabs__item {
    padding: 0 14px;
  }
}
</style>
