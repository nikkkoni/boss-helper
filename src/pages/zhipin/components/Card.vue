<script lang="ts" setup>
import { ElSwitch } from 'element-plus'
import type { ComponentPublicInstance } from 'vue'
import { computed, ref, watch } from 'vue'

import JobCard from '@/components/Jobcard.vue'
import type { EncryptJobId } from '@/stores/jobs'
import { jobList } from '@/stores/jobs'

import { useCardVisualEffects } from '../hooks/useCardVisualEffects'
import { useDeliver } from '../hooks/useDeliver'
import WorkspaceSectionHeader from './workspace/WorkspaceSectionHeader.vue'

const deliver = useDeliver()
const jobSetRef = ref<Record<EncryptJobId, Element | ComponentPublicInstance | null>>({})
const autoScroll = ref(true)
const cards = ref<HTMLDivElement>()
const boardRef = ref<HTMLDivElement | null>(null)
const { blurEnabled, updatePointerHighlight, clearPointerHighlight } = useCardVisualEffects()

const currentJobLabel = computed(() => deliver.currentData?.jobName ?? '等待开始')
const currentStatusLabel = computed(() => deliver.currentData?.status.msg || '尚未开始处理')
const candidateSummary = computed(() => `${jobList.list.length} 个候选岗位`)

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

function handleBoardMouseMove(event: MouseEvent) {
  if (!boardRef.value) {
    return
  }

  updatePointerHighlight(event, boardRef.value)
}

function handleBoardMouseLeave() {
  if (!boardRef.value) {
    return
  }

  clearPointerHighlight(boardRef.value)
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
    ref="boardRef"
    style="order: -1"
    class="boss-helper-card bh-glass-surface bh-glass-surface--hero"
    :class="{ 'boss-helper-card--blur-enabled': blurEnabled }"
    @mousemove="handleBoardMouseMove"
    @mouseleave="handleBoardMouseLeave"
  >
    <div class="boss-helper-card__header">
      <WorkspaceSectionHeader
        eyebrow="Candidate Board"
        title="候选岗位面板"
        description="保持横向浏览、自动跟随和左右导航能力，同时把当前处理岗位与状态提示收敛到同一块头部信息中。"
        :meta="candidateSummary"
      />

      <div class="boss-helper-card__status-grid">
        <article class="boss-helper-card__status bh-workspace-stat-card bh-glass-surface bh-glass-surface--nested">
          <span>当前岗位</span>
          <strong>{{ currentJobLabel }}</strong>
          <small>跟随当前处理中的岗位卡片。</small>
        </article>

        <article class="boss-helper-card__status bh-workspace-stat-card bh-glass-surface bh-glass-surface--nested">
          <span>当前状态</span>
          <strong>{{ currentStatusLabel }}</strong>
          <small>用于判断当前 run 在候选面板里的进度反馈。</small>
        </article>
      </div>
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
      <div class="card-grid-overlay" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.boss-helper-card {
  position: relative;
  --x: 0px;
  --y: 0px;
  --r: 0px;
  isolation: isolate;
  padding: 22px;
}

.boss-helper-card__header {
  display: grid;
  gap: 18px;
  margin-bottom: 18px;
}

.boss-helper-card__status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-width: min(360px, 100%);
}

.boss-helper-card__status {
  min-height: 124px;
}

.boss-helper-card__status small {
  display: block;
  line-height: 1.55;
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
  position: relative;
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

.card-grid-overlay {
  display: none;
  position: absolute;
  inset: 0;
  z-index: 2;
  will-change:
    mask-image,
    -webkit-mask-image,
    backdrop-filter;
  transform: translateZ(0);
  backdrop-filter: blur(var(--bh-overlay-blur));
  -webkit-backdrop-filter: blur(var(--bh-overlay-blur));
  background-color: var(--bh-surface-overlay);
  pointer-events: none;
  -webkit-mask-image: radial-gradient(
    circle var(--r) at var(--x) var(--y),
    transparent 100%,
    black 100%
  );
  mask-image: radial-gradient(circle var(--r) at var(--x) var(--y), transparent 100%, black 100%);
  transition: -webkit-mask-image 0.2s ease;
}

.boss-helper-card--blur-enabled .card-grid-overlay {
  display: block;
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

  .boss-helper-card__status-grid,
  .boss-helper-card__toolbar {
    grid-template-columns: 1fr;
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
