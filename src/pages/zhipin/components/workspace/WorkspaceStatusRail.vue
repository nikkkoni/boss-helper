<script lang="ts" setup>
import { computed } from 'vue'

import WorkspaceSectionHeader from './WorkspaceSectionHeader.vue'

type WorkspaceTabName = 'config' | 'filter' | 'logs'

const props = defineProps<{
  currentUserLabel: string
  deliveryStateLabel: string
  deliveryStateTone: 'completed' | 'error' | 'idle' | 'paused' | 'running'
  deliveryStatusMessage: string
  pageProgressLabel: string
  primaryActionDisabled?: boolean
  primaryActionLabel: string
  resetVisible?: boolean
  routeLabel: string
  searchPanelLabel: string
  showPauseAction?: boolean
  todaySummary: string
  totalJobsLabel: string
}>()

const emit = defineEmits<{
  'open-tab': [tab: WorkspaceTabName]
  'pause-action': []
  'primary-action': []
  'reset-action': []
}>()

const contextItems = computed(() => [
  {
    label: '当前账号',
    value: props.currentUserLabel,
    help: '这里展示当前工作台识别到的 Boss 账号。',
  },
  {
    label: '页面路由',
    value: props.routeLabel,
    help: '这里展示当前工作台挂载到的 Boss 页面类型。',
  },
  {
    label: '搜索桥接',
    value: props.searchPanelLabel,
    help: '这里展示当前页面接入的 Boss 原生搜索或筛选模块类型。',
  },
  {
    label: '候选岗位',
    value: props.totalJobsLabel,
    help: '这里展示当前页面可供候选卡片带快速浏览的岗位数量。',
  },
])

const progressFacts = computed(() => [
  {
    label: '页面进度',
    value: props.pageProgressLabel,
    caption: '用于判断当前页还剩多少岗位待处理。',
    help: '这里展示当前页面岗位列表的处理进度。',
  },
  {
    label: '今日投递',
    value: props.todaySummary,
    caption: '保持观察今日完成数量与投递上限。',
    help: '这里集中展示当前批处理状态、页面进度和今日投递摘要。',
  },
])

const quickActions = computed(() => {
  const actions: Array<{
    label: string
    help: string
    onClick: () => void
    accent?: boolean
    disabled?: boolean
  }> = [
    {
      label: props.primaryActionLabel,
      help: '按当前状态开始或继续批处理。',
      onClick: () => emit('primary-action'),
      accent: true,
      disabled: props.primaryActionDisabled,
    },
  ]

  if (props.showPauseAction) {
    actions.push({
      label: '暂停投递',
      help: '暂停当前批处理，等待当前岗位处理完成后停止。',
      onClick: () => emit('pause-action'),
    })
  }

  if (props.resetVisible) {
    actions.push({
      label: '重置筛选',
      help: '重置当前页已筛掉的岗位状态，便于重新运行当前页。',
      onClick: () => emit('reset-action'),
    })
  }

  actions.push(
    {
      label: '打开筛选区',
      help: '跳转到 Boss 原生搜索和筛选桥接模块。',
      onClick: () => emit('open-tab', 'filter'),
    },
    {
      label: '调整配置',
      help: '跳转到投递配置模块，继续调整筛选、外观或 AI 设置。',
      onClick: () => emit('open-tab', 'config'),
    },
    {
      label: '查看日志',
      help: '跳转到运行日志模块，查看详情、错误和 AI 过滤内容。',
      onClick: () => emit('open-tab', 'logs'),
    },
  )

  return actions
})
</script>

<template>
  <section
    class="workspace-status-rail bh-glass-surface bh-glass-surface--card"
    data-help="这里集中展示运行状态、页面上下文和高频快捷操作。"
  >
    <WorkspaceSectionHeader
      eyebrow="Status Rail"
      title="运行侧栏"
      description="把当前 run 的状态、页面上下文和快捷操作收拢进一个统一模块，切换 Tab 时也能持续观察。"
    />

    <div class="workspace-status-rail__sections bh-workspace-section-gap">
      <section
        class="workspace-status-rail__section bh-glass-surface bh-glass-surface--nested"
        data-help="这里集中展示当前批处理状态、状态消息和关键进度。"
      >
        <WorkspaceSectionHeader
          eyebrow="Run"
          title="运行状态"
          description="保持当前 run 的状态、状态消息和进度摘要在同一个视线区域。"
          compact
        />

        <div class="workspace-status-rail__status-row">
          <span
            class="workspace-status-rail__status-pill"
            :class="`workspace-status-rail__status-pill--${deliveryStateTone}`"
          >
            {{ deliveryStateLabel }}
          </span>
        </div>

        <p class="workspace-status-rail__message">{{ deliveryStatusMessage }}</p>

        <div class="workspace-status-rail__facts">
          <article
            v-for="item in progressFacts"
            :key="item.label"
            class="workspace-status-rail__fact bh-glass-surface bh-glass-surface--soft"
            :data-help="item.help"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <p>{{ item.caption }}</p>
          </article>
        </div>
      </section>

      <section
        class="workspace-status-rail__section bh-glass-surface bh-glass-surface--nested"
        data-help="这里展示当前页面上下文，帮助判断当前工作台接入的是哪一类 Boss 页面。"
      >
        <WorkspaceSectionHeader
          eyebrow="Context"
          title="页面上下文"
          description="帮助你快速确认当前工作台接入的页面、搜索桥接模式和账号上下文。"
          compact
        />

        <dl class="workspace-status-rail__context-list">
          <div
            v-for="item in contextItems"
            :key="item.label"
            class="workspace-status-rail__context-item"
            :data-help="item.help"
          >
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </div>
        </dl>
      </section>

      <section
        class="workspace-status-rail__section bh-glass-surface bh-glass-surface--nested"
        data-help="这里提供最常用的快捷操作，避免切换到其他 Tab 才能继续下一步。"
      >
        <WorkspaceSectionHeader
          eyebrow="Quick Actions"
          title="快捷操作"
          description="保留高频 run 操作，并补充到配置、筛选和日志模块的快速跳转。"
          compact
        />

        <div class="workspace-status-rail__actions">
          <button
            v-for="action in quickActions"
            :key="action.label"
            type="button"
            class="workspace-status-rail__action bh-glass-button"
            :class="{ 'bh-glass-button--accent': action.accent }"
            :disabled="action.disabled"
            :data-help="action.help"
            @click="action.onClick()"
          >
            {{ action.label }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.workspace-status-rail {
  padding: 20px;
}

.workspace-status-rail__sections {
  width: 100%;
}

.workspace-status-rail__section {
  padding: 18px;
}

.workspace-status-rail__status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.workspace-status-rail__status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: var(--bh-radius-pill);
  font-size: 0.84rem;
  font-weight: 700;
}

.workspace-status-rail__status-pill--idle {
  background: rgb(148 163 184 / 12%);
  border-color: rgb(148 163 184 / 20%);
  color: var(--bh-text-secondary);
}

.workspace-status-rail__status-pill--running {
  background: rgb(20 184 166 / 14%);
  border-color: rgb(20 184 166 / 26%);
  color: var(--bh-accent);
}

.workspace-status-rail__status-pill--paused {
  background: rgb(245 158 11 / 14%);
  border-color: rgb(245 158 11 / 22%);
  color: #b45309;
}

.workspace-status-rail__status-pill--completed {
  background: rgb(34 197 94 / 14%);
  border-color: rgb(34 197 94 / 22%);
  color: #15803d;
}

.workspace-status-rail__status-pill--error {
  background: rgb(239 68 68 / 14%);
  border-color: rgb(239 68 68 / 20%);
  color: #b91c1c;
}

:global(html.dark) .workspace-status-rail__status-pill--paused {
  color: #fbbf24;
}

:global(html.dark) .workspace-status-rail__status-pill--completed {
  color: #4ade80;
}

:global(html.dark) .workspace-status-rail__status-pill--error {
  color: #fda4af;
}

.workspace-status-rail__message {
  margin: 14px 0 0;
  color: var(--bh-text-secondary);
  line-height: 1.7;
}

.workspace-status-rail__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.workspace-status-rail__fact {
  min-width: 0;
  padding: 14px;
}

.workspace-status-rail__fact span,
.workspace-status-rail__fact p {
  color: var(--bh-text-muted);
}

.workspace-status-rail__fact span {
  display: inline-flex;
  margin-bottom: 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workspace-status-rail__fact strong,
.workspace-status-rail__context-item dd {
  display: block;
  color: var(--bh-text-primary);
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.4;
  word-break: break-word;
}

.workspace-status-rail__fact p {
  margin: 8px 0 0;
  line-height: 1.6;
}

.workspace-status-rail__context-list {
  display: grid;
  gap: 12px;
  margin: 0;
}

.workspace-status-rail__context-item {
  display: grid;
  gap: 4px;
}

.workspace-status-rail__context-item dt {
  color: var(--bh-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-status-rail__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.workspace-status-rail__action {
  min-height: 44px;
  padding: 0 14px;
  font-size: 0.9rem;
  font-weight: 600;
}

.workspace-status-rail__action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}

.workspace-status-rail__action:disabled:hover {
  box-shadow: var(--bh-shadow-button);
}

@media (max-width: 1280px) {
  .workspace-status-rail__facts,
  .workspace-status-rail__actions {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .workspace-status-rail {
    padding: 18px;
    border-radius: 22px;
  }

  .workspace-status-rail__section {
    padding: 16px;
  }
}
</style>
