<script lang="ts" setup>
import { ElSwitch } from 'element-plus'
import type { ComponentPublicInstance } from 'vue'
import { ref, watch } from 'vue'

import JobCard from '@/components/Jobcard.vue'
import type { EncryptJobId } from '@/stores/jobs'
import { jobList } from '@/stores/jobs'

import { useDeliver } from '../hooks/useDeliver'

const deliver = useDeliver()
const jobSetRef = ref<Record<EncryptJobId, Element | ComponentPublicInstance | null>>({})
const autoScroll = ref(true)
const cards = ref<HTMLDivElement>()

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
  <div style="order: -1" class="boss-helper-card">
    <div class="boss-helper-card__header">
      <div>
        <span class="boss-helper-card__eyebrow">候选岗位看板</span>
        <h3>{{ jobList.list.length }} 个岗位可快速浏览</h3>
      </div>

      <div class="boss-helper-card__controls">
        <div class="boss-helper-card__nav-group">
          <button
            type="button"
            class="boss-helper-card__nav boss-helper-card__nav--prev"
            @click="nudgeCards('prev')"
          >
            左移
          </button>
          <button
            type="button"
            class="boss-helper-card__nav boss-helper-card__nav--next"
            @click="nudgeCards('next')"
          >
            右移
          </button>
        </div>

        <div class="boss-helper-card__toggle">
          <span>自动跟随当前岗位</span>
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
  overflow: hidden;
  padding: 22px;
  border-radius: 28px;
  border: 1px solid rgb(148 163 184 / 18%);
  background:
    radial-gradient(circle at top right, rgb(56 189 248 / 14%), transparent 28%),
    radial-gradient(circle at left bottom, rgb(251 191 36 / 18%), transparent 34%),
    linear-gradient(165deg, rgb(255 255 255 / 92%), rgb(248 250 252 / 96%));
  box-shadow:
    0 24px 48px rgb(15 23 42 / 10%),
    inset 0 1px 0 rgb(255 255 255 / 82%);
}

.boss-helper-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.boss-helper-card__controls {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.boss-helper-card__nav-group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.boss-helper-card__nav {
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: rgb(255 255 255 / 82%);
  box-shadow: inset 0 0 0 1px rgb(148 163 184 / 18%);
  color: #0f172a;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

.boss-helper-card__nav:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 0 0 1px rgb(14 165 233 / 22%),
    0 14px 24px rgb(14 165 233 / 14%);
}

.boss-helper-card__eyebrow {
  display: inline-flex;
  margin-bottom: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #0f766e;
}

.boss-helper-card__header h3 {
  margin: 0;
  font-size: 1.3rem;
  letter-spacing: -0.03em;
}

.boss-helper-card__toggle {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgb(255 255 255 / 72%);
  box-shadow: inset 0 0 0 1px rgb(148 163 184 / 18%);
  color: #475569;
  font-weight: 600;
}

.card-grid-shell {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
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
  padding: 10px 2px 2px;
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
  will-change:
    mask-image,
    -webkit-mask-image,
    backdrop-filter;
  transform: translateZ(0);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  background-color: #ffffff20;
  pointer-events: none;
  -webkit-mask-image: radial-gradient(
    circle var(--r) at var(--x) var(--y),
    transparent 100%,
    black 100%
  );
  mask-image: radial-gradient(circle var(--r) at var(--x) var(--y), transparent 100%, black 100%);
  transition: -webkit-mask-image 0.2s ease;
}

html.dark {
  .boss-helper-card {
    border-color: rgb(71 85 105 / 42%);
    background:
      radial-gradient(circle at top right, rgb(6 182 212 / 14%), transparent 28%),
      radial-gradient(circle at left bottom, rgb(168 85 247 / 14%), transparent 34%),
      linear-gradient(165deg, rgb(15 23 42 / 92%), rgb(30 41 59 / 94%));
    box-shadow:
      0 24px 48px rgb(2 6 23 / 34%),
      inset 0 1px 0 rgb(255 255 255 / 5%);
  }

  .boss-helper-card__eyebrow {
    color: #67e8f9;
  }

  .boss-helper-card__toggle {
    background: rgb(15 23 42 / 62%);
    box-shadow: inset 0 0 0 1px rgb(71 85 105 / 32%);
    color: #cbd5e1;
  }

  .boss-helper-card__nav {
    background: rgb(15 23 42 / 62%);
    box-shadow: inset 0 0 0 1px rgb(71 85 105 / 32%);
    color: #e2e8f0;
  }

  .card-grid {
    scrollbar-width: none;
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

  .boss-helper-card__controls {
    width: 100%;
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
}
</style>
