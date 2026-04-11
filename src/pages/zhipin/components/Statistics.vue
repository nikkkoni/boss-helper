<script lang="ts" setup>
import {
  ElButton,
  ElButtonGroup,
  ElCol,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElIcon,
  ElProgress,
  ElRow,
  ElStatistic,
} from 'element-plus'
import { computed, onMounted, ref } from 'vue'

import Alert from '@/components/Alert'
import { useCommon } from '@/stores/common'
import { useConf } from '@/stores/conf'
import { useStatistics } from '@/stores/statistics'

import { useDeliveryControl } from '../hooks/useDeliveryControl'

const statistics = useStatistics()
const common = useCommon()
const conf = useConf()
const { pauseBatch, resetFilter, resumeBatch, startBatch } = useDeliveryControl()
const statisticCycle = ref(1)
const statisticCycleData = [
  {
    label: '近三日投递',
    help: '愿你每一次投递都能得到回应',
    date: 3,
  },
  {
    label: '本周投递',
    help: '愿你早日找到心满意足的工作',
    date: 7,
  },
  {
    label: '本月投递',
    help: '愿你在面试中得到满意的结果',
    date: 30,
  },
  {
    label: '历史投递',
    help: '愿你能早九晚五还双休带五险',
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

const activityRatio = computed(() => {
  return formatPercent(statistics.todayData.activityFilter, statistics.todayData.total)
})

const aiRequestCount = computed(() => statistics.todayData.aiRequestCount ?? 0)
const aiTotalTokens = computed(() => statistics.todayData.aiTotalTokens ?? 0)
const aiTotalCost = computed(() => statistics.todayData.aiTotalCost ?? 0)

const isPaused = computed(() => common.deliverState === 'paused' && !common.deliverLock)

onMounted(() => {
  statistics.updateStatistics()
})
</script>

<template>
  <Alert
    id="config-statistics"
    style="margin-bottom: 10px"
    title="数据并不完全准确，投递上限根据自身情况调整, 建议 120-140, boss限制最高150"
    type="warning"
  />
  <ElRow v-if="conf.config_level.intermediate" :gutter="20">
    <ElCol :span="5">
      <ElStatistic
        data-help="统计当天脚本扫描过的所有岗位"
        :value="statistics.todayData.total"
        title="岗位总数："
        suffix="份"
      />
    </ElCol>
    <ElCol :span="5">
      <ElStatistic
        data-help="统计当天岗位过滤的比例,被过滤/总数"
        :value="filterRatio"
        title="过滤比例："
        suffix="%"
      />
    </ElCol>
    <ElCol :span="5">
      <ElStatistic
        data-help="统计当天岗位中已沟通的比例,已沟通/总数"
        :value="repeatRatio"
        title="沟通比例："
        suffix="%"
      />
    </ElCol>
    <ElCol :span="5">
      <ElStatistic
        data-help="统计当天岗位中的活跃情况,不活跃/总数"
        :value="activityRatio"
        title="活跃比例："
        suffix="%"
      />
    </ElCol>
    <ElCol :span="4">
      <ElStatistic
        :data-help="statisticCycleData[statisticCycle].help"
        :value="cycle + statistics.todayData.success"
        suffix="份"
      >
        <template #title>
          <ElDropdown
            trigger="click"
            @command="
              (arg) => {
                statisticCycle = arg
              }
            "
          >
            <span class="el-dropdown-link">
              {{ statisticCycleData[statisticCycle].label }}:
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
    </ElCol>
  </ElRow>
  <ElRow v-if="conf.config_level.intermediate" :gutter="20" style="margin-top: 10px">
    <ElCol :span="8">
      <ElStatistic
        data-help="统计当天 AI 调用次数，包括筛选和招呼语生成"
        :value="aiRequestCount"
        title="AI调用："
        suffix="次"
      />
    </ElCol>
    <ElCol :span="8">
      <ElStatistic
        data-help="统计当天累计消耗的 token 总量"
        :value="aiTotalTokens"
        title="Token总量："
        suffix="tok"
      />
    </ElCol>
    <ElCol :span="8">
      <ElStatistic
        data-help="根据模型单价估算的累计费用，未配置单价时始终为 0"
        :precision="6"
        :value="aiTotalCost"
        title="估算费用："
      />
    </ElCol>
  </ElRow>
  <div style="display: flex">
    <ElButtonGroup style="margin: 10px 30px 0 0">
      <ElButton
        type="primary"
        data-help="点击开始就会开始投递"
        :loading="common.deliverLock"
        @click="isPaused ? resumeBatch() : startBatch()"
      >
        {{ isPaused ? '继续' : '开始' }}
      </ElButton>
      <ElButton
        v-if="!common.deliverLock && common.deliverStop"
        type="warning"
        data-help="重置已被筛选的岗位，开始将重新处理"
        @click="resetFilter"
      >
        重置筛选
      </ElButton>
      <ElButton
        v-if="common.deliverLock && !common.deliverStop"
        type="warning"
        data-help="暂停后应该能继续"
        @click="pauseBatch()"
      >
        暂停
      </ElButton>
    </ElButtonGroup>
    <ElProgress
      data-help="我会统计当天脚本投递的数量,该记录并不准确"
      style="flex: 1"
      :percentage="Number(((statistics.todayData.success / deliveryLimit) * 100).toFixed(1))"
    />
  </div>
</template>

<style lang="scss"></style>
