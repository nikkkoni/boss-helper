<script lang="ts" setup>
import { ElCheckbox } from 'element-plus'
import { computed } from 'vue'

const props = defineProps<{
  currentUserLabel: string
  helpVisible: boolean
  todaySummary: string
}>()

const emit = defineEmits<{
  'update:helpVisible': [value: boolean]
}>()

const helpModel = computed({
  get: () => props.helpVisible,
  set: value => emit('update:helpVisible', value),
})
</script>

<template>
  <div class="bh-workspace-stack">
    <div
      class="helper-dashboard__copy bh-glass-surface bh-glass-surface--hero"
      data-help="这里集中展示当前工作台状态与关键入口。"
    >
      <span class="helper-dashboard__eyebrow bh-eyebrow">Boss Helper Workspace</span>
      <h2>投递控制台</h2>
      <p>把筛选、统计、配置和日志整合进一个更清晰的工作台，减少在页面里来回寻找入口。</p>
      <p class="helper-dashboard__summary">
        {{ todaySummary }}
      </p>
    </div>

    <div class="helper-dashboard__toolbar bh-workspace-toolbar bh-workspace-toolbar--wrap">
      <label
        class="helper-help-toggle bh-glass-pill"
        data-help="开启后，把鼠标悬停在控件上即可查看帮助说明。"
      >
        <span class="helper-help-toggle__title">帮助模式</span>
        <ElCheckbox v-model="helpModel" label="悬停说明" size="large" @click.stop />
      </label>

      <div class="helper-status-pill bh-glass-pill" data-help="这里展示当前识别到的账号和帮助高亮状态。">
        <span class="helper-status-pill__dot" />
        <div>
          <strong>{{ currentUserLabel }}</strong>
          <span>{{ helpVisible ? '帮助高亮已开启' : '帮助高亮已关闭' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.helper-dashboard__eyebrow {
  margin-bottom: 10px;
}

.helper-dashboard__copy {
  padding: 24px;
}

.helper-dashboard__copy h2 {
  margin: 0;
  font-size: clamp(1.6rem, 1.2rem + 1vw, 2.2rem);
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.helper-dashboard__copy p {
  max-width: 760px;
  margin: 12px 0 0;
  color: var(--bh-text-secondary);
  line-height: 1.75;
}

.helper-dashboard__summary {
  display: inline-flex;
  margin-top: 18px;
  padding: 10px 14px;
  border-radius: 999px;
  background: var(--bh-accent-pill-bg);
  color: var(--bh-text-primary) !important;
  font-weight: 700;
}

.helper-dashboard__toolbar {
  gap: 14px;
}

.helper-help-toggle,
.helper-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 12px 16px;
}

.helper-help-toggle {
  min-width: 240px;
  justify-content: space-between;
}

.helper-help-toggle__title {
  font-weight: 700;
}

.helper-status-pill {
  flex: 1;
  min-width: 0;
}

.helper-status-pill__dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--bh-status-dot-bg);
  box-shadow: var(--bh-status-dot-shadow);
}

.helper-status-pill strong,
.helper-status-pill span {
  display: block;
}

.helper-status-pill strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.98rem;
}

.helper-status-pill span {
  margin-top: 2px;
  color: var(--bh-text-muted);
  font-size: 0.84rem;
}

@media (max-width: 960px) {
  .helper-dashboard__toolbar {
    grid-template-columns: 1fr;
    display: grid;
    justify-content: stretch;
  }

  .helper-help-toggle,
  .helper-status-pill {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .helper-dashboard__copy {
    padding: 18px;
    border-radius: 22px;
  }
}
</style>
