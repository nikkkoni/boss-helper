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
    }"
  >
    <div class="job-card__header">
      <div class="card-tag">{{ job.brandIndustry }},{{ job.jobDegree }},{{ job.brandScaleName }}</div>
      <div class="card-status">{{ job.status.msg || '待处理' }}</div>
    </div>

    <a
      :href="`https://www.zhipin.com/job_detail/${job.encryptJobId}.html`"
      target="_blank"
      class="card-title"
    >
      {{ job.jobName }}
    </a>

    <h3 class="card-salary">
      {{ job.salaryDesc }}
    </h3>

    <p class="card-subtitle">{{ job.cityName }}/{{ job.areaDistrict }}/{{ job.businessDistrict }}</p>

    <button
      v-show="showDescription"
      :id="descriptionId"
      class="card-content"
      :title="job.card?.postDescription"
      type="button"
      @click="showDescription = false"
    >
      {{ job.card?.postDescription }}
    </button>
    <button
      v-show="!showDescription"
      class="card-content"
      type="button"
      :aria-controls="descriptionId"
      :aria-expanded="showDescription"
      @click="showDescriptionHandler"
    >
      <div>
        <ElSpace :size="3" wrap>
          <ElTag v-for="tag in job.skills" :key="tag" size="small" effect="plain" type="warning">
            {{ tag }}
          </ElTag>
          <ElTag v-for="tag in job.jobLabels" :key="tag" size="small" effect="plain" type="success">
            {{ tag }}
          </ElTag>
        </ElSpace>
      </div>
      <div class="card-footer">
        {{ job.welfareList.join(',') }}
      </div>
    </button>

    <div v-if="job.card?.brandComInfo?.activeTime" class="active-time-tag">
      <ElTag :type="getActiveTimeType(job.card.brandComInfo.activeTime)" effect="plain">
        活跃时间：{{ new Date(job.card?.brandComInfo.activeTime).toLocaleString() }}
      </ElTag>
    </div>

    <div class="author-row">
      <img
        :alt="job.brandName ? `${job.brandName} logo` : '公司 logo'"
        class="avatar"
        height="80"
        :src="job.brandLogo"
        width="80"
      />
      <div>
        <span class="company-name">{{ job.brandName }}</span>
        <h4>{{ job.cityName }}/{{ job.areaDistrict }}/{{ job.businessDistrict }}</h4>
      </div>
    </div>
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
  padding: 1.4rem;
  border-radius: 24px;
  border: 1px solid rgb(148 163 184 / 10%);
  background:
    radial-gradient(circle at top right, rgb(14 165 233 / 12%), transparent 30%),
    linear-gradient(180deg, rgb(255 255 255 / 94%), rgb(248 250 252 / 98%));
  color: #0f172a;
  display: flex;
  flex-direction: column;
  gap: 0;
  transition:
    transform 0.24s ease,
    box-shadow 0.24s ease,
    border-color 0.24s ease;
  margin: 0;
  box-shadow:
    0 18px 34px rgb(15 23 42 / 8%),
    inset 0 1px 0 rgb(255 255 255 / 84%);

  .job-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 0.85rem;
  }

  .card-tag {
    flex: 1;
    min-width: 0;
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1.5;
    text-transform: uppercase;
  }

  .card-status {
    flex-shrink: 0;
    padding: 0.45rem 0.78rem;
    border-radius: 999px;
    background: var(--state-color);
    color: #fff;
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1;
    box-shadow: 0 12px 22px rgb(15 23 42 / 12%);
  }

  .card-title {
    font-size: 1.24rem;
    margin: 0;
    font-weight: 700;
    line-height: 1.35;
    color: inherit;

    &:hover {
      color: #0ea5e9;
    }
  }

  .card-salary {
    margin: 0.7rem 0 0;
    font-size: 1.18rem;
    color: #f97316;
  }

  .card-subtitle {
    margin: 0.35rem 0 1rem;
    color: #64748b;
    line-height: 1.5;
  }

  .card-footer {
    -webkit-margin-before: auto;
    margin-block-start: auto;
    padding: 5px 0 0;
    color: #64748b;
    line-height: 1.55;
  }

  .active-time-tag {
    padding: 1rem 0 0;
    display: flex;
    justify-content: flex-start;
  }

  .card-content {
    cursor: pointer;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 150px;
    margin-top: 0.25rem;
    padding: 1rem;
    border: 1px solid rgb(148 163 184 / 10%);
    border-radius: 18px;
    background: rgb(248 250 252 / 88%);
    text-align: left;
    color: inherit;

    &:focus-visible {
      outline: 2px solid #0ea5e9;
      outline-offset: 2px;
    }
  }

  .avatar {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    margin-right: 0.5rem;
    border: 1px solid rgb(148 163 184 / 16%);
    background: #fff;
    object-fit: cover;
    box-shadow: 0 12px 22px rgb(15 23 42 / 10%);
  }

  .author-row {
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: 0.75rem;
    align-items: center;
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid rgb(148 163 184 / 10%);
    color: #64748b;
    line-height: 1.3;

    h4 {
      margin: 0.2rem 0 0;
      font-size: 0.88rem;
      font-weight: 500;
    }

    .company-name {
      color: #0f172a;
      font-weight: 700;
    }
  }

  &:focus-within,
  &.job-card-hover:hover {
    transform: translateY(-6px);
    border-color: rgb(14 165 233 / 28%);
    box-shadow: 0 28px 52px rgb(14 165 233 / 16%);
  }

  @media (max-width: 1200px) {
    & {
      min-width: 280px;
    }
  }
}

html.dark {
  .job-card {
    border-color: rgb(71 85 105 / 26%);
    background:
      radial-gradient(circle at top right, rgb(6 182 212 / 12%), transparent 30%),
      linear-gradient(180deg, rgb(15 23 42 / 94%), rgb(30 41 59 / 96%));
    color: #e2e8f0;
    box-shadow:
      0 18px 34px rgb(2 6 23 / 26%),
      inset 0 1px 0 rgb(255 255 255 / 5%);

    .card-title {
      color: #e2e8f0;

      &:hover {
        color: #67e8f9;
      }
    }

    .card-tag,
    .card-subtitle,
    .card-footer,
    .author-row {
      color: #94a3b8;
    }

    .author-row {
      border-top-color: rgb(71 85 105 / 28%);

      .company-name {
        color: #f8fafc;
      }
    }

    .card-content {
      border-color: rgb(71 85 105 / 20%);
      background: rgb(15 23 42 / 54%);
      color: #f8fafc;
    }
  }
}
</style>
