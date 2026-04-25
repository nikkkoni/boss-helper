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
import WorkspaceSectionHeader from './workspace/WorkspaceSectionHeader.vue'
import WorkspaceShell from './workspace/WorkspaceShell.vue'
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

const helpVisible = ref(false)
const activeTab = ref('statistics')
const workspaceTabLabelMap: Record<string, string> = {
  statistics: '统计概览',
  filter: '筛选条件',
  config: '投递配置',
  logs: '运行日志',
  about: '项目说明',
}
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
const todayProgressLabel = computed(
  () => `${todayData.success}/${conf.formData.deliveryLimit.value}`,
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
const activeWorkspaceTabLabel = computed(() => workspaceTabLabelMap[activeTab.value] ?? '主工作区')
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

  // 帮助模式覆盖整个工作台，主区和候选岗位面板都能获得 hover 提示。
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
          :today-progress-label="todayProgressLabel"
        />
      </template>

      <HelpOverlay :visible="helpVisible" :root-element="helpRootElement" />

      <template #main>
        <section class="helper-dashboard__panel-group">
          <section
            class="helper-workspace bh-glass-surface"
            data-help="这里集中展示当前工作台的主业务模块与标签切换。"
          >
            <div class="helper-workspace__topbar">
              <WorkspaceSectionHeader
                eyebrow="Workspace"
                title="主工作区"
                :meta="activeWorkspaceTabLabel"
                size="toolbar"
              />
            </div>

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

      <Teleport to="#boss-helper-job-wrap,.page-job-inner .page-job-content">
        <Card
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
          :total-jobs-label="totalJobsLabel"
          @open-tab="handleOpenTab"
          @pause-action="() => void pauseBatch()"
          @primary-action="handlePrimaryAction"
          @reset-action="resetFilter"
        />
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

.helper-dashboard .ehp-checkbox.is-bordered {
  max-width: 100%;
  min-height: 44px;
  height: auto;
  margin: 0;
  padding-inline: 14px;
  border-radius: var(--bh-radius-md);
  white-space: normal;
}

.helper-dashboard .ehp-checkbox.is-bordered .ehp-checkbox__label {
  overflow-wrap: anywhere;
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

.helper-dashboard .ehp-input__wrapper,
.helper-dashboard .ehp-select__wrapper,
.helper-dashboard .ehp-textarea__inner,
.helper-dashboard .ehp-input-number,
.helper-dashboard .ehp-input-number .ehp-input__wrapper {
  min-height: 44px;
}

.helper-dashboard .ehp-input-number {
  width: 100%;
}

.helper-dashboard .ehp-button {
  min-height: 44px;
  padding-inline: 16px;
  font-weight: 600;
}

.helper-dashboard .ehp-alert {
  padding: 14px 16px;
}

.helper-dashboard .ehp-alert__title {
  line-height: 1.5;
}

.helper-dashboard .ehp-alert__description {
  line-height: 1.6;
}

.helper-dashboard .ehp-table,
.helper-dashboard .ehp-table-v2 {
  border-radius: var(--bh-radius-md);
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

.helper-workspace {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: visible !important;
  padding: 16px;
}

.helper-workspace__topbar {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 2px 0;
}

@media (max-width: 640px) {
  .helper-workspace {
    padding: 16px;
    border-radius: 20px;
  }

  .helper-workspace__topbar {
    align-items: flex-start;
  }
}
</style>
