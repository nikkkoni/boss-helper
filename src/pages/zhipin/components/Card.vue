<script lang="ts" setup>
import { ElSwitch } from 'element-plus'
import type { ComponentPublicInstance } from 'vue'
import { computed, ref, watch } from 'vue'

import JobCard from '@/components/Jobcard.vue'
import type { EncryptJobId } from '@/stores/jobs'
import { jobList } from '@/stores/jobs'

import { useDeliver } from '../hooks/useDeliver'
import WorkspaceSectionHeader from './workspace/WorkspaceSectionHeader.vue'

type WorkspaceTabName = 'config' | 'filter' | 'logs'
type DeliveryStateTone = 'completed' | 'error' | 'idle' | 'paused' | 'running'

const props = withDefaults(
  defineProps<{
    deliveryStateLabel?: string
    deliveryStateTone?: DeliveryStateTone
    deliveryStatusMessage?: string
    pageProgressLabel?: string
    primaryActionDisabled?: boolean
    primaryActionLabel?: string
    resetVisible?: boolean
    routeLabel?: string
    searchPanelLabel?: string
    showPauseAction?: boolean
    totalJobsLabel?: string
  }>(),
  {
    deliveryStateLabel: '未开始',
    deliveryStateTone: 'idle',
    deliveryStatusMessage: '',
    pageProgressLabel: '待开始',
    primaryActionDisabled: false,
    primaryActionLabel: '开始投递',
    resetVisible: false,
    routeLabel: '未知路由',
    searchPanelLabel: '搜索桥接待识别',
    showPauseAction: false,
    totalJobsLabel: '',
  },
)

const emit = defineEmits<{
  'open-tab': [tab: WorkspaceTabName]
  'pause-action': []
  'primary-action': []
  'reset-action': []
}>()

const deliver = useDeliver()
const jobSetRef = ref<Record<EncryptJobId, Element | ComponentPublicInstance | null>>({})
const autoScroll = ref(true)
const cards = ref<HTMLDivElement>()

const currentJobLabel = computed(() => deliver.currentData?.jobName ?? '等待开始')
const currentStatusLabel = computed(() => deliver.currentData?.status.msg || '尚未开始处理')
const candidateSummary = computed(() => props.totalJobsLabel || `${jobList.list.length} 个候选岗位`)

const runFacts = computed(() => [
  {
    label: '当前岗位',
    value: currentJobLabel.value,
    caption: currentStatusLabel.value,
    help: '这里展示当前正在处理或等待处理的岗位。',
  },
  {
    label: '页面进度',
    value: props.pageProgressLabel,
    caption: '当前页岗位处理进度',
    help: '这里展示当前页面岗位列表的处理进度。',
  },
  {
    label: '页面路由',
    value: props.routeLabel,
    caption: props.searchPanelLabel,
    help: '这里展示当前工作台接入的 Boss 页面类型和搜索桥接方式。',
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

function scroll(e: WheelEvent) {
  if (!cards.value) {
    return
  }

  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX !== 0) {
    autoScroll.value = false
    return
  }

  e.preventDefault()
  cards.value.scrollLeft = cards.value.scrollLeft + e.deltaY / 2
  autoScroll.value = false
}

function nudgeCards(direction: 'prev' | 'next') {
  if (!cards.value) {
    return
  }

  const distance = Math.max(240, Math.round(cards.value.clientWidth * 0.75))
  const left = direction === 'next' ? distance : -distance
  cards.value.scrollBy({ left, behavior: 'smooth' })
  autoScroll.value = false
}

function scrollHandler() {
  if (!deliver.currentData?.encryptJobId) {
    return
  }
  const d = jobSetRef.value[deliver.currentData?.encryptJobId ?? '']
  if (!d) {
    return
  }
  if ('scrollIntoView' in d) {
    d.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  } else if ('$el' in d) {
    d?.$el.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }
}

watch(
  () => deliver.currentData,
  () => {
    if (autoScroll.value) {
      scrollHandler()
    }
  },
)
</script>

<template>
  <div
    style="order: -1"
    class="boss-helper-card bh-glass-surface bh-glass-surface--hero"
  >
    <div class="boss-helper-card__header">
      <WorkspaceSectionHeader
        eyebrow="Candidate Board"
        title="候选岗位面板"
        description="把当前处理岗位、运行状态、页面信息和快捷操作收进同一块候选面板。"
        :meta="candidateSummary"
      />

      <div class="boss-helper-card__status-grid">
        <article
          class="boss-helper-card__run-state bh-workspace-stat-card bh-glass-surface bh-glass-surface--nested"
          data-help="这里集中展示当前批处理状态和状态消息。"
        >
          <div class="boss-helper-card__run-state-topline">
            <span>运行状态</span>
            <strong
              class="boss-helper-card__status-pill"
              :class="`boss-helper-card__status-pill--${deliveryStateTone}`"
            >
              {{ deliveryStateLabel }}
            </strong>
          </div>
          <p>{{ deliveryStatusMessage || currentStatusLabel }}</p>
        </article>

        <article
          v-for="fact in runFacts"
          :key="fact.label"
          class="boss-helper-card__status bh-workspace-stat-card bh-glass-surface bh-glass-surface--nested"
          :data-help="fact.help"
        >
          <span>{{ fact.label }}</span>
          <strong>{{ fact.value }}</strong>
          <small>{{ fact.caption }}</small>
        </article>
      </div>
    </div>

    <div class="boss-helper-card__actions" data-help="这里提供常用 run 操作和工作台跳转。">
      <button
        v-for="action in quickActions"
        :key="action.label"
        type="button"
        class="boss-helper-card__action bh-glass-button"
        :class="{ 'bh-glass-button--accent': action.accent }"
        :disabled="action.disabled"
        :data-help="action.help"
        @click="action.onClick()"
      >
        {{ action.label }}
      </button>
    </div>

    <div class="boss-helper-card__toolbar">
      <div class="boss-helper-card__nav-group bh-glass-pill" data-help="使用左右导航快速浏览候选岗位卡片，不影响当前自动投递逻辑。">
        <button
          type="button"
          class="boss-helper-card__nav boss-helper-card__nav--prev bh-glass-button"
          @click="nudgeCards('prev')"
        >
          左移
        </button>
        <button
          type="button"
          class="boss-helper-card__nav boss-helper-card__nav--next bh-glass-button"
          @click="nudgeCards('next')"
        >
          右移
        </button>
      </div>

      <div class="boss-helper-card__toggle bh-glass-pill" data-help="开启后会自动把当前处理岗位滚动到视野中，手动滚动后会自动关闭。">
        <div class="boss-helper-card__toggle-copy">
          <span>自动跟随当前岗位</span>
          <small>{{ autoScroll ? '当前开启自动对齐' : '当前处于手动浏览模式' }}</small>
        </div>
        <ElSwitch
          v-model="autoScroll"
          inline-prompt
          active-text="开"
          inactive-text="关"
          @change="
            (v) => {
              if (v) {
                scrollHandler()
              }
            }
          "
        />
      </div>
    </div>

    <div class="card-grid-shell">
      <div
        ref="cards"
        class="card-grid"
        @wheel.stop="scroll"
      >
        <JobCard
          v-for="job in jobList.list"
          :ref="
            (ref) => {
              jobSetRef[job.encryptJobId] = ref
            }
          "
          :key="job.encryptJobId"
          :job="job"
          hover
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.boss-helper-card {
  padding: 22px;
}

.boss-helper-card__header {
  display: grid;
  gap: 18px;
  margin-bottom: 18px;
}

.boss-helper-card__status-grid {
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) repeat(3, minmax(160px, 1fr));
  gap: 12px;
  min-width: min(360px, 100%);
}

.boss-helper-card__run-state,
.boss-helper-card__status {
  min-height: 124px;
}

.boss-helper-card__run-state {
  display: grid;
  align-content: start;
  gap: 12px;
}

.boss-helper-card__run-state-topline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.boss-helper-card__run-state p {
  margin: 0;
  color: var(--bh-text-secondary);
  line-height: 1.65;
}

.boss-helper-card__status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--bh-radius-pill);
  font-size: 0.82rem;
  font-weight: 700;
}

.boss-helper-card__status-pill--idle {
  background: rgb(148 163 184 / 12%);
  border-color: rgb(148 163 184 / 20%);
  color: var(--bh-text-secondary);
}

.boss-helper-card__status-pill--running {
  background: rgb(20 184 166 / 14%);
  border-color: rgb(20 184 166 / 26%);
  color: var(--bh-accent);
}

.boss-helper-card__status-pill--paused {
  background: rgb(245 158 11 / 14%);
  border-color: rgb(245 158 11 / 22%);
  color: #b45309;
}

.boss-helper-card__status-pill--completed {
  background: rgb(34 197 94 / 14%);
  border-color: rgb(34 197 94 / 22%);
  color: #15803d;
}

.boss-helper-card__status-pill--error {
  background: rgb(239 68 68 / 14%);
  border-color: rgb(239 68 68 / 20%);
  color: #b91c1c;
}

:global(html.dark) .boss-helper-card__status-pill--paused {
  color: #fbbf24;
}

:global(html.dark) .boss-helper-card__status-pill--completed {
  color: #4ade80;
}

:global(html.dark) .boss-helper-card__status-pill--error {
  color: #fda4af;
}

.boss-helper-card__status small,
.boss-helper-card__run-state > span,
.boss-helper-card__run-state-topline > span {
  display: block;
  line-height: 1.55;
}

.boss-helper-card__status strong {
  overflow-wrap: anywhere;
}

.boss-helper-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.boss-helper-card__action {
  min-height: 40px;
  padding: 0 14px;
  font-size: 0.85rem;
  font-weight: 700;
}

.boss-helper-card__action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}

.boss-helper-card__action:disabled:hover {
  box-shadow: var(--bh-shadow-button);
}

.boss-helper-card__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.boss-helper-card__nav-group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
}

.boss-helper-card__nav {
  min-height: 40px;
  padding: 0 14px;
  font-size: 0.85rem;
  font-weight: 700;
}

.boss-helper-card__toggle {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 10px 14px;
  color: var(--bh-text-secondary);
  font-weight: 600;
}

.boss-helper-card__toggle-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.boss-helper-card__toggle-copy span {
  color: var(--bh-text-primary);
  font-size: 0.88rem;
  font-weight: 700;
}

.boss-helper-card__toggle-copy small {
  color: var(--bh-text-muted);
  line-height: 1.5;
}

.card-grid-shell {
  overflow: hidden;
  border-radius: var(--bh-radius-panel);
  border: 1px solid var(--bh-border-subtle);
  background: var(--bh-surface-soft);
  box-shadow: var(--bh-shadow-soft);
}

.card-grid {
  display: flex;
  gap: 18px;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -ms-overflow-style: none;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
  overscroll-behavior-x: contain;
  padding: 16px;
  -webkit-overflow-scrolling: touch;

  > * {
    flex: 0 0 auto;
    scroll-snap-align: start;
  }

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
    background: transparent;
  }

  &::-webkit-scrollbar-thumb,
  &::-webkit-scrollbar-track,
  &::-webkit-scrollbar-corner {
    background: transparent;
    border: 0;
    box-shadow: none;
  }
}
html.dark {
  .card-grid {
    scrollbar-width: none;
  }

  .card-grid-shell {
    background: linear-gradient(165deg, rgb(15 23 42 / 74%), rgb(30 41 59 / 80%));
  }
}

@media (max-width: 768px) {
  .boss-helper-card {
    padding: 18px;
    border-radius: 22px;
  }

  .boss-helper-card__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .boss-helper-card__status-grid,
  .boss-helper-card__toolbar {
    width: 100%;
  }

  .boss-helper-card__status-grid {
    grid-template-columns: 1fr;
  }

  .boss-helper-card__toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .boss-helper-card__nav-group {
    width: 100%;
  }

  .boss-helper-card__nav {
    flex: 1;
  }

  .boss-helper-card__toggle {
    width: 100%;
    justify-content: space-between;
  }

  .card-grid {
    padding: 14px;
  }
}
</style>
