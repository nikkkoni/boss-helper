<script lang="ts" setup>
import { ElConfigProvider, ElMessage } from 'element-plus'
import { computed, nextTick, onMounted, onUnmounted, ref, unref } from 'vue'

import { useModel } from '@/composables/useModel'
import type { BossHelperAgentState } from '@/message/agent'
import { useCommon } from '@/stores/common'
import { useConf } from '@/stores/conf'
import { jobList } from '@/stores/jobs'
import { useStatistics } from '@/stores/statistics'
import { useUser } from '@/stores/user'
import { logger } from '@/utils/logger'

import { useDeliver } from '../hooks/useDeliver'
import { useAppearanceEffects } from '../hooks/useAppearanceEffects'
import { useDeliveryControl } from '../hooks/useDeliveryControl'
import { useHostSearchPanel } from '../hooks/useHostSearchPanel'
import { usePager } from '../hooks/usePager'
import About from './About.vue'
import Card from './Card.vue'
import Config from './Config.vue'
import HelpOverlay from './help/HelpOverlay.vue'
import Logs from './Logs.vue'
import Statistics from './Statistics.vue'
import WorkspaceHeader from './workspace/WorkspaceHeader.vue'
import WorkspaceMetrics from './workspace/WorkspaceMetrics.vue'
import WorkspaceSectionHeader from './workspace/WorkspaceSectionHeader.vue'
import WorkspaceShell from './workspace/WorkspaceShell.vue'
import WorkspaceStatusRail from './workspace/WorkspaceStatusRail.vue'
import WorkspaceTabs from './workspace/WorkspaceTabs.vue'

const user = useUser()
const model = useModel()
const { initPager } = usePager()
const common = useCommon()
const { pauseBatch, registerWindowAgentBridge, resetFilter, resumeBatch, startBatch } =
  useDeliveryControl()
const deliver = useDeliver()
const { todayData } = useStatistics()
const conf = useConf()
const { mountSearchPanel, searchPanelKind } = useHostSearchPanel()
let unregisterAgentBridge: (() => void) | undefined

useAppearanceEffects()

const helpVisible = ref(false)
const activeTab = ref('statistics')
type WorkspaceTabsExpose = {
  getSearchMountElement: () => HTMLElement | null
  getTabsRootElement: () => HTMLElement | null
}

type WorkspaceShellExpose = {
  getRootElement: () => HTMLElement | null
}

const tabsRef = ref<WorkspaceTabsExpose | null>(null)
const shellRef = ref<WorkspaceShellExpose | null>(null)
const helpRootElement = ref<HTMLElement | null>(null)
const userInfo = computed(() => unref(user.info))
const currentUserLabel = computed(
  () => userInfo.value?.showName ?? userInfo.value?.name ?? '未识别当前账号',
)
const dashboardSummary = computed(
  () => `今日投递: ${todayData.success}/${conf.formData.deliveryLimit.value}`,
)
const pageProgressLabel = computed(() =>
  deliver.total > 0 ? `${Math.min(deliver.current + 1, deliver.total)}/${deliver.total}` : '待开始',
)
const totalJobsLabel = computed(() => `${jobList.list.length} 个岗位`)
const routeLabel = computed(() => {
  const pathname = location.pathname
  if (pathname.startsWith('/web/geek/jobs')) {
    return '/web/geek/jobs'
  }
  if (pathname.startsWith('/web/geek/job-recommend')) {
    return '/web/geek/job-recommend'
  }
  if (pathname.startsWith('/web/geek/job')) {
    return '/web/geek/job'
  }
  return pathname || '未知路由'
})
const searchPanelLabel = computed(() => {
  switch (searchPanelKind) {
    case 'jobs':
      return '新版 jobs 搜索桥接'
    case 'recommend':
      return '推荐页搜索桥接'
    default:
      return '经典职位页搜索桥接'
  }
})
const isPaused = computed(() => common.deliverState === 'paused' && !common.deliverLock)
const primaryActionLabel = computed(() => (isPaused.value ? '继续投递' : '开始投递'))
const primaryActionDisabled = computed(() => common.deliverLock && common.deliverState !== 'paused')
const showPauseAction = computed(() => common.deliverLock && !common.deliverStop)
const showResetAction = computed(() => !common.deliverLock && common.deliverStop)
const deliveryStateLabelMap: Record<BossHelperAgentState, string> = {
  idle: '未开始',
  running: '运行中',
  pausing: '暂停中',
  paused: '已暂停',
  completed: '已完成',
  error: '异常中断',
}
const deliveryStateLabel = computed(() => deliveryStateLabelMap[common.deliverState] ?? '未开始')
const deliveryStateTone = computed<'completed' | 'error' | 'idle' | 'paused' | 'running'>(() => {
  switch (common.deliverState) {
    case 'completed':
      return 'completed'
    case 'error':
      return 'error'
    case 'paused':
    case 'pausing':
      return 'paused'
    case 'running':
      return 'running'
    default:
      return 'idle'
  }
})
const deliveryStatusMessage = computed(() => common.deliverStatusMessage || '未开始')
const dashboardMetrics = computed(() => [
  {
    label: '今日投递',
    value: `${todayData.success}/${conf.formData.deliveryLimit.value}`,
    caption: '已完成 / 当日上限',
    help: '这里显示今天已经完成的投递数量以及当前配置的上限。',
  },
  {
    label: '当前页面',
    value: pageProgressLabel.value,
    caption: deliver.total > 0 ? '当前页面扫描进度' : '等待开始处理',
    help: '这里显示当前页面岗位列表的处理进度。',
  },
  {
    label: '当前账号',
    value: currentUserLabel.value,
    caption: helpVisible.value ? '帮助模式已开启' : '帮助模式未开启',
    help: '这里显示当前识别到的 Boss 账号和帮助模式状态。',
  },
])

function handlePrimaryAction() {
  if (isPaused.value) {
    void resumeBatch()
    return
  }

  void startBatch()
}

function handleOpenTab(tab: 'config' | 'filter' | 'logs') {
  activeTab.value = tab
}

onMounted(async () => {
  unregisterAgentBridge = registerWindowAgentBridge()
  void conf.confInit()
  void user.initUser()
  void user.initCookie()
  void model.initModel()
  try {
    await jobList.initJobList(conf.formData)
  } catch (e) {
    logger.error('初始化职位列表失败', { error: e })
    ElMessage.error(`列表初始失败: ${e instanceof Error ? e.message : '未知错误'}`)
  }

  await nextTick()

  const searchMount = tabsRef.value?.getSearchMountElement() ?? undefined
  await mountSearchPanel(searchMount)

  initPager().catch((e) => {
    logger.error('初始化分页器失败', { error: e })
    ElMessage.error(`分页器初始失败: ${e instanceof Error ? e.message : '未知错误'}`)
  })

  // 帮助模式改为覆盖整个工作台，这样侧栏新增模块也能获得 hover 提示。
  helpRootElement.value =
    shellRef.value?.getRootElement() ?? tabsRef.value?.getTabsRootElement() ?? null
})

onUnmounted(() => {
  unregisterAgentBridge?.()
  helpRootElement.value = null
})
</script>

<template>
  <ElConfigProvider namespace="ehp">
    <WorkspaceShell ref="shellRef">
      <template #header>
        <WorkspaceHeader
          v-model:help-visible="helpVisible"
          :current-user-label="currentUserLabel"
          :today-summary="dashboardSummary"
        />
      </template>

      <template #metrics>
        <WorkspaceMetrics :items="dashboardMetrics" />
      </template>

      <HelpOverlay :visible="helpVisible" :root-element="helpRootElement" />

      <template #main>
        <section class="helper-dashboard__panel-group bh-workspace-section-gap">
          <section
            class="helper-dashboard__panel helper-dashboard__panel--workspace bh-glass-surface"
            data-help="这里集中展示当前工作台的主业务模块与标签切换。"
          >
            <WorkspaceSectionHeader
              eyebrow="Workspace"
              title="主工作区"
              description="左侧保留原有标签页结构，用于承载统计、筛选、配置、日志和项目说明。"
              :meta="routeLabel"
            />

            <WorkspaceTabs v-model="activeTab" ref="tabsRef" :search-panel-kind="searchPanelKind">
              <template #statistics>
                <Statistics />
              </template>

              <template #config>
                <Config />
              </template>

              <template #logs>
                <Logs />
              </template>

              <template #about>
                <About />
              </template>
            </WorkspaceTabs>
          </section>
        </section>
      </template>

      <template #aside>
        <WorkspaceStatusRail
          :current-user-label="currentUserLabel"
          :delivery-state-label="deliveryStateLabel"
          :delivery-state-tone="deliveryStateTone"
          :delivery-status-message="deliveryStatusMessage"
          :page-progress-label="pageProgressLabel"
          :primary-action-disabled="primaryActionDisabled"
          :primary-action-label="primaryActionLabel"
          :reset-visible="showResetAction"
          :route-label="routeLabel"
          :search-panel-label="searchPanelLabel"
          :show-pause-action="showPauseAction"
          :today-summary="dashboardSummary"
          :total-jobs-label="totalJobsLabel"
          @open-tab="handleOpenTab"
          @pause-action="() => void pauseBatch()"
          @primary-action="handlePrimaryAction"
          @reset-action="resetFilter"
        />
      </template>

      <Teleport to="#boss-helper-job-wrap,.page-job-inner .page-job-content">
        <Card />
      </Teleport>
      <!-- <Teleport to=".page-job-wrapper">
      <chatVue
        style="
          position: fixed;
          top: 70px;
          left: 20px;
          height: calc(100vh - 80px);
          display: flex;
          flex-direction: column;
          width: 28%;
          max-width: 540px;
        "
      />
    </Teleport> -->
    </WorkspaceShell>
  </ElConfigProvider>
</template>

<style lang="scss">
#boss-helper-job {
  margin-bottom: 8px;
  *:not(.ehp-tab-pane *) {
    user-select: none;
  }
}

.helper-dashboard .ehp-checkbox {
  color: var(--bh-text-secondary);
}

.helper-dashboard .ehp-checkbox.is-checked .ehp-checkbox__label {
  color: var(--bh-text-primary) !important;
}

.helper-dashboard .ehp-form {
  .ehp-link {
    font-size: 12px;
  }
  .ehp-form-item__label {
    display: flex;
    align-items: center;
  }
  .ehp-checkbox__label {
    padding-left: 4px;
  }
}

.helper-dashboard .ehp-alert,
.helper-dashboard .ehp-collapse-item__header,
.helper-dashboard .ehp-collapse-item__wrap,
.helper-dashboard .ehp-form-item,
.helper-dashboard .ehp-statistic,
.helper-dashboard .ehp-progress-bar__outer,
.helper-dashboard .ehp-table,
.helper-dashboard .ehp-button-group,
.helper-dashboard .ehp-button {
  border-radius: var(--bh-radius-md);
}

.helper-dashboard .ehp-tabs__content {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  overflow: unset !important;
}

.helper-dashboard__panel {
  padding: 22px;
}

.helper-dashboard__panel.helper-dashboard__panel--workspace.bh-glass-surface {
  overflow: visible !important;
}

@media (max-width: 640px) {
  .helper-dashboard__panel {
    padding: 18px;
    border-radius: 22px;
  }
}
</style>
