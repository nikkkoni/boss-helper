<script setup lang="ts">
import { ElSpace, ElTag } from 'element-plus'
import { computed, ref } from 'vue'

import type { MyJobListData } from '@/stores/jobs'

const props = defineProps<{
  job: MyJobListData
  hover?: boolean
}>()

const showDescription = ref(false)
const descriptionId = computed(() => `job-card-description-${props.job.encryptJobId}`)

const statusLabel = computed(() => props.job.status.msg || '无内容')
const companyMeta = computed(() => [props.job.brandIndustry, props.job.jobDegree, props.job.brandScaleName].filter(Boolean).join(' / '))
const locationLabel = computed(() => [props.job.cityName, props.job.areaDistrict, props.job.businessDistrict].filter(Boolean).join(' / '))
const cardTags = computed(() => [...props.job.skills, ...props.job.jobLabels].filter(Boolean))
const welfareLabel = computed(() => props.job.welfareList.filter(Boolean).join('，') || '暂无补充福利信息')

function stateColor(state?: string): string {
  switch (state) {
    case 'pending':
      return '#CECECE'
    case 'wait':
      return '#CECECE'
    case 'error':
      return '#e74c3c'
    case 'warn':
      return '#f39c12'
    case 'success':
      return '#2ecc71'
    case 'running':
      return '#98F5F9'
  }
  return '#CECECE'
}

async function showDescriptionHandler() {
  showDescription.value = true
  if (props.job.card == null) {
    await props.job.getCard()
  }
}

function getActiveTimeType(activeTime?: number): 'success' | 'warning' | 'danger' {
  if (!activeTime) return 'danger'

  const now = Date.now()
  const diffDays = (now - activeTime) / (1000 * 60 * 60 * 24)

  if (diffDays <= 2) return 'success'
  if (diffDays <= 7) return 'warning'
  return 'danger'
}
</script>

<template>
  <div
    class="job-card"
    :class="{ 'job-card-hover': hover }"
    :style="{
      '--state-color': stateColor(job.status.status),
      '--state-show': job.status.status !== 'pending' ? 'inline-flex' : 'none',
    }"
  >
    <header class="job-card__header">
      <div class="job-card__meta-block">
        <span class="job-card__eyebrow">候选岗位</span>
        <div class="job-card__meta">{{ companyMeta }}</div>
      </div>
      <div class="job-card__status">{{ statusLabel }}</div>
    </header>

    <a
      :href="`https://www.zhipin.com/job_detail/${job.encryptJobId}.html`"
      target="_blank"
      rel="noreferrer"
      class="job-card__title"
    >
      {{ job.jobName }}
    </a>

    <h3 class="job-card__salary">
      {{ job.salaryDesc }}
    </h3>

    <p class="job-card__location">{{ locationLabel }}</p>

    <div class="job-card__tag-strip">
      <ElTag v-for="tag in cardTags" :key="tag" size="small" effect="plain" class="job-card__tag">
        {{ tag }}
      </ElTag>
    </div>

    <button
      v-show="showDescription"
      :id="descriptionId"
      class="job-card__content"
      :title="job.card?.postDescription"
      type="button"
      @click="showDescription = false"
    >
      {{ job.card?.postDescription }}
    </button>
    <button
      v-show="!showDescription"
      class="job-card__content"
      type="button"
      :aria-controls="descriptionId"
      :aria-expanded="showDescription"
      @click="showDescriptionHandler"
    >
      <div class="job-card__content-copy">
        <strong>展开职位描述</strong>
        <p>点击后懒加载岗位详情，查看职位描述与企业活跃时间。</p>
      </div>

      <div class="job-card__content-tags">
        <ElSpace :size="6" wrap>
          <ElTag v-for="tag in cardTags" :key="tag" size="small" effect="plain" class="job-card__tag">
            {{ tag }}
          </ElTag>
        </ElSpace>
      </div>

      <div class="job-card__footer">
        {{ welfareLabel }}
      </div>
    </button>

    <div v-if="job.card?.brandComInfo?.activeTime" class="job-card__active-time">
      <ElTag :type="getActiveTimeType(job.card.brandComInfo.activeTime)" effect="plain" class="job-card__active-tag">
        活跃时间：{{ new Date(job.card?.brandComInfo.activeTime).toLocaleString() }}
      </ElTag>
    </div>

    <footer class="job-card__company">
      <img
        :alt="job.brandName ? `${job.brandName} logo` : '公司 logo'"
        class="job-card__avatar"
        height="80"
        :src="job.brandLogo"
        width="80"
      />
      <div class="job-card__company-copy">
        <span class="job-card__company-name">{{ job.brandName }}</span>
        <h4>{{ locationLabel }}</h4>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.job-card {
  --state-color: #f00;

  position: relative;
  overflow: hidden;
  min-width: 320px;
  max-width: 360px;
  min-height: 28rem;
  padding: 1.35rem;
  border-radius: var(--bh-radius-panel);
  border: 1px solid var(--bh-border-subtle);
  background: var(--bh-surface-jobcard);
  color: var(--bh-text-primary);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  transition:
    transform 0.24s ease,
    border-color 0.24s ease,
    box-shadow 0.24s ease;
  margin: 0;
  box-shadow: var(--bh-shadow-card);
}

.job-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.job-card__meta-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.job-card__eyebrow,
.job-card__meta {
  color: var(--bh-text-muted);
}

.job-card__eyebrow {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.job-card__meta {
  line-height: 1.55;
  word-break: break-word;
}

.job-card__status {
  display: var(--state-show);
  flex-shrink: 0;
  align-items: center;
  min-height: 34px;
  padding: 0.45rem 0.78rem;
  border: 1px solid color-mix(in srgb, var(--state-color) 36%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--state-color) 14%, transparent);
  color: color-mix(in srgb, var(--state-color) 86%, white 14%);
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1.2;
  box-shadow: var(--bh-shadow-pill);
}

.job-card__title {
  font-size: 1.24rem;
  margin: 0;
  font-weight: 700;
  line-height: 1.35;
  color: inherit;
}

.job-card__title:hover {
  color: var(--bh-link-hover);
}

.job-card__salary {
  margin: 0;
  font-size: 1.18rem;
  color: var(--bh-salary-text);
}

.job-card__location {
  margin: -0.35rem 0 0;
  color: var(--bh-text-muted);
  line-height: 1.6;
}

.job-card__tag-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 30px;
}

.job-card__tag {
  border-radius: 999px;
  background: var(--bh-surface-pill);
  color: var(--bh-text-secondary);
  border-color: var(--bh-border-subtle);
}

.job-card__content {
  cursor: pointer;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  min-height: 170px;
  padding: 1rem;
  border: 1px solid var(--bh-border-subtle);
  border-radius: var(--bh-radius-card);
  background: var(--bh-surface-muted);
  text-align: left;
  color: inherit;
}

:global(html.dark) .job-card__content {
  background: rgb(15 23 42 / 62%);
}

.job-card__content:focus-visible {
  outline: 2px solid var(--bh-focus-ring);
  outline-offset: 2px;
}

.job-card__content-copy strong {
  display: block;
  color: var(--bh-text-primary);
  font-size: 0.94rem;
  font-weight: 700;
}

.job-card__content-copy p,
.job-card__footer {
  margin: 0;
  color: var(--bh-text-muted);
  line-height: 1.6;
}

.job-card__content-tags {
  min-height: 30px;
}

.job-card__footer {
  margin-top: auto;
}

.job-card__active-time {
  display: flex;
  justify-content: flex-start;
}

.job-card__active-tag {
  border-radius: 999px;
}

.job-card__company {
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 0.75rem;
  align-items: center;
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid var(--bh-border-subtle);
  color: var(--bh-text-muted);
  line-height: 1.3;
}

.job-card__avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--bh-radius-sm);
  border: 1px solid var(--bh-border-subtle);
  background: var(--bh-surface-avatar);
  object-fit: cover;
  box-shadow: var(--bh-avatar-shadow);
}

.job-card__company-copy h4 {
  margin: 0.2rem 0 0;
  font-size: 0.88rem;
  font-weight: 500;
}

.job-card__company-name {
  color: var(--bh-text-primary);
  font-weight: 700;
}

.job-card:focus-within,
.job-card.job-card-hover:hover {
  transform: translateY(-6px);
  border-color: var(--bh-accent-line);
  box-shadow: var(--bh-shadow-accent-soft);
}

.job-card :deep(.ehp-tag) {
  max-width: 100%;
}

@media (max-width: 1200px) {
  .job-card {
    min-width: 280px;
  }
}

@media (max-width: 640px) {
  .job-card {
    min-width: 260px;
    max-width: 320px;
    min-height: 26rem;
    padding: 1.15rem;
  }

  .job-card__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .job-card__status {
    max-width: 100%;
  }
}

</style>
