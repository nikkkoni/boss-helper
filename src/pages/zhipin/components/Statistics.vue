<script lang="ts" setup>
import {
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElIcon,
  ElProgress,
  ElStatistic,
} from 'element-plus'
import { computed, onMounted, ref } from 'vue'

import Alert from '@/components/Alert'
import { useCommon } from '@/stores/common'
import { useConf } from '@/stores/conf'
import { useStatistics } from '@/stores/statistics'

import { useDeliveryControl } from '../hooks/useDeliveryControl'
import WorkspaceSectionHeader from './workspace/WorkspaceSectionHeader.vue'

const statistics = useStatistics()
const common = useCommon()
const conf = useConf()
const { pauseBatch, resetFilter, resumeBatch, startBatch } = useDeliveryControl()
const statisticCycle = ref(1)
const statisticCycleData = [
  {
    label: '近三日投递',
    help: '统计最近 3 天内完成的投递数量，并叠加今天的结果。',
    date: 3,
  },
  {
    label: '本周投递',
    help: '统计最近 7 天内完成的投递数量，并叠加今天的结果。',
    date: 7,
  },
  {
    label: '本月投递',
    help: '统计最近 30 天内完成的投递数量，并叠加今天的结果。',
    date: 30,
  },
  {
    label: '历史投递',
    help: '统计全部历史记录中的投递数量，并叠加今天的结果。',
    date: -1,
  },
]

const cycle = computed(() => {
  const date = statisticCycleData[statisticCycle.value].date
  let ans = 0
  for (
    let i = 0;
    // eslint-disable-next-line no-unmodified-loop-condition
    (date === -1 || i < date - 1) && i < statistics.statisticsData.length;
    i++
  ) {
    ans += statistics.statisticsData[i].success
  }
  return ans
})

const deliveryLimit = computed(() => {
  return conf.formData.deliveryLimit.value
})

function formatPercent(value: number, total: number) {
  if (total <= 0) {
    return 0
  }

  return Number(((value / total) * 100).toFixed(1))
}

const filterRatio = computed(() => {
  return formatPercent(
    statistics.todayData.total - statistics.todayData.success,
    statistics.todayData.total,
  )
})

const repeatRatio = computed(() => {
  return formatPercent(statistics.todayData.repeat, statistics.todayData.total)
})

const aiRequestCount = computed(() => statistics.todayData.aiRequestCount ?? 0)
const aiTotalTokens = computed(() => statistics.todayData.aiTotalTokens ?? 0)
const aiTotalCost = computed(() => statistics.todayData.aiTotalCost ?? 0)

const isPaused = computed(() => common.deliverState === 'paused' && !common.deliverLock)
const dailyProgressPercent = computed(() =>
  Math.min(formatPercent(statistics.todayData.success, deliveryLimit.value), 100),
)
const selectedCycle = computed(() => statisticCycleData[statisticCycle.value] ?? statisticCycleData[0])
const selectedCycleTotal = computed(() => cycle.value + statistics.todayData.success)

onMounted(() => {
  statistics.updateStatistics()
})
</script>

<template>
  <div class="statistics-workbench">
    <Alert
      id="config-statistics"
      title="数据并不完全准确，投递上限根据自身情况调整, 建议 120-140, boss限制最高150"
      type="warning"
    />

    <div class="statistics-workbench__grid">
      <section class="statistics-card statistics-card--wide bh-glass-surface bh-glass-surface--card">
        <WorkspaceSectionHeader
          eyebrow="Overview"
          title="运行概览"
          description="把批处理操作和今日关键指标放进同一块区域，减少在多个卡片之间反复切换。"
        />

        <div class="statistics-card__overview">
          <div class="statistics-card__control-panel bh-glass-surface bh-glass-surface--nested">
            <div class="statistics-card__status-copy">
              <span>今日进度</span>
              <strong>{{ statistics.todayData.success }}/{{ deliveryLimit }}</strong>
              <p>建议上限 120-140，Boss 当前限制最高 150，仅供参考。</p>
            </div>

            <div class="statistics-card__actions">
              <div class="statistics-card__buttons">
                <ElButton
                  type="primary"
                  class="statistics-card__action"
                  data-help="按当前筛选和投递配置开始处理当前页面岗位；暂停后会显示为继续。"
                  :loading="common.deliverLock"
                  @click="isPaused ? resumeBatch() : startBatch()"
                >
                  {{ isPaused ? '继续' : '开始' }}
                </ElButton>
                <ElButton
                  v-if="!common.deliverLock && common.deliverStop"
                  type="warning"
                  class="statistics-card__action"
                  data-help="重置已被筛选的岗位，开始将重新处理"
                  @click="resetFilter"
                >
                  重置筛选
                </ElButton>
                <ElButton
                  v-if="common.deliverLock && !common.deliverStop"
                  type="warning"
                  class="statistics-card__action"
                  data-help="暂停当前批处理，保留现场状态，稍后可继续运行。"
                  @click="pauseBatch()"
                >
                  暂停
                </ElButton>
              </div>

              <ElProgress
                class="statistics-card__progress"
                data-help="根据今日已完成投递数和当日上限估算的进度，仅作参考。"
                :percentage="dailyProgressPercent"
              />
            </div>
          </div>

          <div v-if="conf.config_level.intermediate" class="statistics-card__metric-grid">
            <div class="statistics-card__metric">
              <ElStatistic
                data-help="统计当天脚本扫描过的所有岗位"
                :value="statistics.todayData.total"
                title="岗位总数："
                suffix="份"
              />
            </div>
            <div class="statistics-card__metric">
              <ElStatistic
                data-help="统计当天岗位过滤的比例,被过滤/总数"
                :value="filterRatio"
                title="过滤比例："
                suffix="%"
              />
            </div>
            <div class="statistics-card__metric">
              <ElStatistic
                data-help="统计当天岗位中已沟通的比例,已沟通/总数"
                :value="repeatRatio"
                title="沟通比例："
                suffix="%"
              />
            </div>
            <div class="statistics-card__metric">
              <ElStatistic :data-help="selectedCycle.help" :value="selectedCycleTotal" suffix="份">
                <template #title>
                  <ElDropdown
                    trigger="click"
                    @command="
                      (arg) => {
                        statisticCycle = arg
                      }
                    "
                  >
                    <span class="statistics-card__dropdown-link">
                      {{ selectedCycle.label }}:
                      <ElIcon class="el-icon--right">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
                          <path
                            fill="currentColor"
                            d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0 0-41.728 30.592 30.592 0 0 0-42.752 0z"
                          />
                        </svg>
                      </ElIcon>
                    </span>
                    <template #dropdown>
                      <ElDropdownMenu>
                        <ElDropdownItem
                          v-for="(item, index) in statisticCycleData"
                          :key="index"
                          :command="index"
                        >
                          {{ item.label }}
                        </ElDropdownItem>
                      </ElDropdownMenu>
                    </template>
                  </ElDropdown>
                </template>
              </ElStatistic>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="conf.config_level.intermediate"
        class="statistics-card statistics-card--wide bh-glass-surface bh-glass-surface--card"
      >
        <WorkspaceSectionHeader
          eyebrow="AI Usage"
          title="AI 使用情况"
          description="保留调用次数、Token 和估算费用，便于观察当前配置的模型消耗。"
          size="compact"
        />

        <div class="statistics-card__metric-grid statistics-card__metric-grid--secondary">
          <div class="statistics-card__metric">
            <ElStatistic
              data-help="统计当天 AI 调用次数，包括筛选和招呼语生成"
              :value="aiRequestCount"
              title="AI调用："
              suffix="次"
            />
          </div>
          <div class="statistics-card__metric">
            <ElStatistic
              data-help="统计当天累计消耗的 token 总量"
              :value="aiTotalTokens"
              title="Token总量："
              suffix="tok"
            />
          </div>
          <div class="statistics-card__metric">
            <ElStatistic
              data-help="根据模型单价估算的累计费用，未配置单价时始终为 0"
              :precision="6"
              :value="aiTotalCost"
              title="估算费用："
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.statistics-workbench {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.statistics-workbench__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  gap: 18px;
}

.statistics-card {
  padding: 22px;
  border-radius: var(--bh-radius-panel-lg);
}

.statistics-card--wide {
  grid-column: 1 / -1;
}

.statistics-card__overview {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.statistics-card__control-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px;
}

.statistics-card__status-copy {
  display: grid;
  gap: 8px;
}

.statistics-card__status-copy span {
  color: var(--bh-text-muted);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.statistics-card__status-copy strong {
  color: var(--bh-text-primary);
  font-size: clamp(1.7rem, 1.45rem + 0.6vw, 2.15rem);
  line-height: 1;
}

.statistics-card__status-copy p {
  margin: 0;
  color: var(--bh-text-secondary);
  line-height: 1.6;
}

.statistics-card__metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
  gap: 12px;
}

.statistics-card__metric-grid--secondary {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
}

.statistics-card__metric {
  min-width: 0;
  padding: 14px;
  border-radius: var(--bh-radius-card);
  background: var(--bh-surface-nested);
}

.statistics-card__actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
}

.statistics-card__buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
  gap: 12px;
}

.statistics-card__action {
  min-height: 44px;
  margin: 0;
}

.statistics-card__progress {
  width: 100%;
}

.statistics-card__dropdown-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: inherit;
  cursor: pointer;
}

.statistics-card :deep(.ehp-statistic) {
  min-height: 96px;
}

.statistics-card :deep(.ehp-statistic__head) {
  margin-bottom: 10px;
  color: var(--bh-text-muted);
  font-weight: 600;
  line-height: 1.6;
}

.statistics-card :deep(.ehp-statistic__content) {
  color: var(--bh-text-primary);
}

.statistics-card :deep(.ehp-progress-bar__outer) {
  background: var(--bh-progress-track);
}

:global(html.dark) .statistics-card :deep(.ehp-statistic__head),
:global(html.dark) .statistics-card__dropdown-link {
  color: var(--bh-text-muted);
}

@media (max-width: 768px) {
  .statistics-card__overview {
    grid-template-columns: 1fr;
  }

  .statistics-card {
    padding: 18px;
    border-radius: 22px;
  }

  .statistics-card__control-panel {
    padding: 16px;
  }

  .statistics-card__actions {
    gap: 14px;
  }

  .statistics-card__progress {
    width: 100%;
  }
}
</style>
