<script lang="ts" setup>
import { useMouseInElement } from '@vueuse/core'
import { ElCheckbox, ElConfigProvider, ElMessage, ElTabPane, ElTabs, ElTooltip } from 'element-plus'
import { computed, onMounted, onUnmounted, ref, shallowRef, unref, watch } from 'vue'

import { useModel } from '@/composables/useModel'
import { getActiveSiteAdapter } from '@/site-adapters'
import { useConf } from '@/stores/conf'
import { jobList } from '@/stores/jobs'
import { useStatistics } from '@/stores/statistics'
import { useUser } from '@/stores/user'
import { elmGetter } from '@/utils/elmGetter'
import { logger } from '@/utils/logger'
import { SELECTOR_TIMEOUT_MS } from '@/utils/selectors'

import { useDeliver } from '../hooks/useDeliver'
import { useDeliveryControl } from '../hooks/useDeliveryControl'
import { usePager } from '../hooks/usePager'
import About from './About.vue'
import Card from './Card.vue'
import Config from './Config.vue'
import Logs from './Logs.vue'
import Statistics from './Statistics.vue'

const user = useUser()
const model = useModel()
const { initPager } = usePager()
const { registerWindowAgentBridge } = useDeliveryControl()
const deliver = useDeliver()
const { todayData } = useStatistics()
const conf = useConf()
let unregisterAgentBridge: (() => void) | undefined

const helpVisible = ref(false)
const activeTab = ref('statistics')
const searchRef = ref()
const tabsRef = ref()
const helpContent = ref('鼠标移到对应元素查看提示')
const { isOutside } = useMouseInElement(tabsRef)
const currentHelpElement = shallowRef<HTMLElement | null>(null)
const helpAnchorRect = ref({ x: 0, y: 0, width: 0, height: 0 })
const boxStyles = ref<Record<string, string | number>>({
  display: 'none',
})
let tabsRootElement: HTMLElement | null = null

function getSelectors() {
  return getActiveSiteAdapter(location.href).getSelectors()
}

const triggerRef = computed(() => {
  return {
    getBoundingClientRect() {
      return DOMRect.fromRect(helpAnchorRect.value)
    },
  }
})

const helpMaxWidth = computed(() =>
  typeof boxStyles.value.width === 'string' && boxStyles.value.width
    ? boxStyles.value.width
    : '320px',
)
const userInfo = computed(() => unref(user.info))
const currentUserLabel = computed(() => userInfo.value?.showName ?? userInfo.value?.name ?? '未识别当前账号')
const pageProgressLabel = computed(() =>
  deliver.total > 0 ? `${Math.min(deliver.current + 1, deliver.total)}/${deliver.total}` : '待开始',
)
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

function hideHelpBox() {
  currentHelpElement.value = null
  boxStyles.value = {
    display: 'none',
  }
  helpAnchorRect.value = { x: 0, y: 0, width: 0, height: 0 }
}

function findHelpTarget(dom: HTMLElement | null) {
  let current = dom
  while (current) {
    if (current.dataset.help) {
      return current
    }
    current = current.parentElement
  }
  return null
}

function updateHelpBox(target: HTMLElement | null) {
  if (!target) {
    hideHelpBox()
    return
  }

  const help = target.dataset.help
  if (help) {
    helpContent.value = help
  }

  const bounding = target.getBoundingClientRect()
  const styles = window.getComputedStyle(target)
  helpAnchorRect.value = {
    x: bounding.left + bounding.width / 2,
    y: bounding.top + bounding.height / 2,
    width: 0,
    height: 0,
  }
  boxStyles.value = {
    width: `${bounding.width}px`,
    height: `${bounding.height}px`,
    left: `${bounding.left}px`,
    top: `${bounding.top}px`,
    display: 'block',
    backgroundColor: 'rgb(110 231 183 / 18%)',
    borderRadius: styles.borderRadius || '18px',
    boxShadow: 'inset 0 0 0 1px rgb(20 184 166 / 24%)',
    transition: 'all 0.08s linear',
  }
}

function syncHelpTarget(target: EventTarget | null) {
  if (!helpVisible.value || isOutside.value) {
    hideHelpBox()
    return
  }

  const nextTarget = target instanceof HTMLElement ? findHelpTarget(target) : null
  if (nextTarget === currentHelpElement.value) {
    return
  }

  currentHelpElement.value = nextTarget
  updateHelpBox(nextTarget)
}

function refreshHelpBox() {
  if (!helpVisible.value || isOutside.value || currentHelpElement.value == null) {
    hideHelpBox()
    return
  }
  updateHelpBox(currentHelpElement.value)
}

function handleHelpMouseMove(event: MouseEvent) {
  syncHelpTarget(event.target)
}

function handleHelpMouseLeave() {
  hideHelpBox()
}

watch([helpVisible, isOutside], ([visible, outside]) => {
  if (!visible || outside) {
    hideHelpBox()
    return
  }

  refreshHelpBox()
})

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

  const selectors = getSelectors()
  const searchPanelPlan = getActiveSiteAdapter(location.href).getSearchPanelPlan(location.pathname)
  const searchMount = searchRef.value?.$el as HTMLElement | undefined

  if (!searchMount) {
    logger.warn('未找到搜索栏挂载节点')
  } else if (searchPanelPlan.kind === 'recommend') {
    void elmGetter
      .get<HTMLDivElement>(searchPanelPlan.searchSelector, {
        timeoutMs: SELECTOR_TIMEOUT_MS,
      })
      .then((searchEl) => {
        searchEl.style.position = 'unset'
        searchMount.appendChild(searchEl)
      })
      .catch((error) => {
        logger.warn('初始化推荐页搜索栏失败', { error })
      })
  } else if (searchPanelPlan.kind === 'jobs') {
    const div = document.createElement('div')
    div.style.cssText = 'display: flex;flex-direction: column;gap: 15px;'
    searchMount.appendChild(div)
    void elmGetter
      .get<HTMLDivElement>(searchPanelPlan.blockSelectors, {
        timeoutMs: SELECTOR_TIMEOUT_MS,
      })
      .then(([searchEl, conditionEl]) => {
        searchEl.style.position = 'static'
        conditionEl.style.position = 'static'
        div.appendChild(conditionEl)
        void elmGetter
          .get<HTMLInputElement | HTMLDivElement>(searchPanelPlan.inputSelectors, {
            parent: searchEl,
            timeoutMs: SELECTOR_TIMEOUT_MS,
          })
          .then(([searchInputEl, expectSelectEl]) => {
            div.insertBefore(searchInputEl, conditionEl)
            div.insertBefore(expectSelectEl, conditionEl)
            searchEl.style.display = 'none'
          })
          .catch((error) => {
            logger.warn('初始化新版职位页搜索输入失败', { error })
          })
      })
      .catch((error) => {
        logger.warn('初始化新版职位页搜索布局失败', { error })
      })
  } else {
    void elmGetter
      .get<HTMLDivElement>(searchPanelPlan.blockSelectors, {
        timeoutMs: SELECTOR_TIMEOUT_MS,
      })
      .then(([searchEl, conditionEl]) => {
        searchMount.appendChild(searchEl)
        searchMount.appendChild(conditionEl)
        // 搜索栏去APP
        void elmGetter.rm(searchPanelPlan.scanSelector, {
          parent: searchEl,
          timeoutMs: SELECTOR_TIMEOUT_MS,
        })
      })
      .catch((error) => {
        logger.warn('初始化经典职位页搜索布局失败', { error })
      })
  }

  initPager().catch((e) => {
    logger.error('初始化分页器失败', { error: e })
    ElMessage.error(`分页器初始失败: ${e instanceof Error ? e.message : '未知错误'}`)
  })

  tabsRootElement = (tabsRef.value?.$el as HTMLElement | undefined) ?? null
  tabsRootElement?.addEventListener('mousemove', handleHelpMouseMove, true)
  tabsRootElement?.addEventListener('mouseleave', handleHelpMouseLeave, true)
  window.addEventListener('scroll', refreshHelpBox, true)
  window.addEventListener('resize', refreshHelpBox)
})

onUnmounted(() => {
  unregisterAgentBridge?.()
  tabsRootElement?.removeEventListener('mousemove', handleHelpMouseMove, true)
  tabsRootElement?.removeEventListener('mouseleave', handleHelpMouseLeave, true)
  window.removeEventListener('scroll', refreshHelpBox, true)
  window.removeEventListener('resize', refreshHelpBox)
  tabsRootElement = null
})
</script>

<template>
  <ElConfigProvider namespace="ehp">
    <div class="helper-dashboard">
      <section class="helper-dashboard__hero">
        <div class="helper-dashboard__copy" data-help="这里集中展示当前工作台状态与关键入口。">
          <span class="helper-dashboard__eyebrow">Boss Helper Workspace</span>
          <h2>投递控制台</h2>
          <p>把筛选、统计、配置和日志整合进一个更清晰的工作台，减少在页面里来回寻找入口。</p>
          <p class="helper-dashboard__summary">
            今日投递: {{ todayData.success }}/{{ conf.formData.deliveryLimit.value }}
          </p>
        </div>

        <div class="helper-dashboard__toolbar">
          <label class="helper-help-toggle" data-help="开启后，把鼠标悬停在控件上即可查看帮助说明。">
            <span class="helper-help-toggle__title">帮助模式</span>
            <ElCheckbox v-model="helpVisible" label="悬停说明" size="large" @click.stop="" />
          </label>

          <div class="helper-status-pill" data-help="这里展示当前识别到的账号和帮助高亮状态。">
            <span class="helper-status-pill__dot" />
            <div>
              <strong>{{ currentUserLabel }}</strong>
              <span>{{ helpVisible ? '帮助高亮已开启' : '帮助高亮已关闭' }}</span>
            </div>
          </div>
        </div>

        <div class="helper-metric-grid">
          <article
            v-for="item in dashboardMetrics"
            :key="item.label"
            class="helper-metric-card"
            :data-help="item.help"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <p>{{ item.caption }}</p>
          </article>
        </div>
      </section>

      <div class="helper-help-overlay" :style="boxStyles" />

      <ElTooltip :visible="helpVisible && !isOutside" :virtual-ref="triggerRef" placement="top">
        <template #content>
          <div :style="`width: auto;max-width:${helpMaxWidth};font-size:16px;line-height:1.6;`">
            {{ helpContent }}
          </div>
        </template>
      </ElTooltip>

      <ElTabs
        v-model="activeTab"
        ref="tabsRef"
        class="helper-tabs"
        data-help="鼠标移到对应元素查看提示"
      >
        <ElTabPane label="统计概览" name="statistics" data-help="失败是成功她妈">
          <section class="helper-panel helper-panel--statistics">
            <Statistics />
          </section>
        </ElTabPane>
        <ElTabPane ref="searchRef" class="helper-search-pane" label="筛选条件" name="filter" />
        <ElTabPane label="投递配置" name="config" data-help="好好看，好好学">
          <section class="helper-panel">
            <Config />
          </section>
        </ElTabPane>
        <ElTabPane label="运行日志" name="logs" data-help="反正你也不看">
          <section class="helper-panel">
            <Logs />
          </section>
        </ElTabPane>
        <ElTabPane
          label="项目说明"
          name="about"
          class="hp-about-box"
          data-help="项目是写不完美的,但总要去追求完美"
        >
          <section class="helper-panel helper-panel--about">
            <About />
          </section>
        </ElTabPane>
      </ElTabs>

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
    </div>
  </ElConfigProvider>
</template>

<style lang="scss">
#boss-helper-job {
  margin-bottom: 8px;
  *:not(.ehp-tab-pane *) {
    user-select: none;
  }
}

.helper-dashboard {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: #0f172a;
}

.helper-dashboard__hero {
  position: relative;
  display: grid;
  gap: 18px;
}

.helper-dashboard__copy,
.helper-dashboard__toolbar,
.helper-metric-grid {
  position: relative;
  z-index: 1;
}

.helper-dashboard__eyebrow {
  display: inline-flex;
  margin-bottom: 10px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #0f766e;
}

.helper-dashboard__copy {
  overflow: hidden;
  padding: 24px;
  border-radius: 28px;
  border: 1px solid rgb(148 163 184 / 24%);
  background:
    radial-gradient(circle at top right, rgb(251 191 36 / 24%), transparent 34%),
    radial-gradient(circle at left bottom, rgb(14 165 233 / 16%), transparent 38%),
    linear-gradient(160deg, rgb(255 255 255 / 88%), rgb(248 250 252 / 96%));
  box-shadow:
    0 28px 60px rgb(15 23 42 / 12%),
    inset 0 1px 0 rgb(255 255 255 / 78%);
  backdrop-filter: blur(18px);
}

.helper-dashboard__copy h2 {
  margin: 0;
  font-size: clamp(1.6rem, 1.2rem + 1vw, 2.2rem);
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.helper-dashboard__copy p {
  max-width: 760px;
  margin: 12px 0 0;
  color: #475569;
  line-height: 1.75;
}

.helper-dashboard__summary {
  display: inline-flex;
  margin-top: 18px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgb(15 118 110 / 10%);
  color: #0f172a !important;
  font-weight: 700;
}

.helper-dashboard__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.helper-help-toggle,
.helper-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 12px 16px;
  border-radius: 20px;
  border: 1px solid rgb(148 163 184 / 18%);
  background:
    radial-gradient(circle at top right, rgb(56 189 248 / 10%), transparent 32%),
    linear-gradient(165deg, rgb(255 255 255 / 72%), rgb(248 250 252 / 82%));
  box-shadow:
    0 18px 36px rgb(15 23 42 / 8%),
    inset 0 1px 0 rgb(255 255 255 / 54%);
  backdrop-filter: blur(16px);
}

.helper-help-toggle {
  min-width: 240px;
  justify-content: space-between;
}

.helper-help-toggle__title {
  font-weight: 700;
}

.helper-status-pill {
  flex: 1;
  min-width: 0;
}

.helper-status-pill__dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #14b8a6, #0ea5e9);
  box-shadow: 0 0 0 8px rgb(20 184 166 / 12%);
}

.helper-status-pill strong,
.helper-status-pill span {
  display: block;
}

.helper-status-pill strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.98rem;
}

.helper-status-pill span {
  margin-top: 2px;
  color: #64748b;
  font-size: 0.84rem;
}

.helper-metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.helper-metric-card {
  position: relative;
  overflow: hidden;
  min-width: 0;
  padding: 16px 18px;
  min-height: 148px;
  border-radius: 24px;
  border: 1px solid rgb(148 163 184 / 18%);
  background:
    radial-gradient(circle at top right, rgb(56 189 248 / 12%), transparent 28%),
    radial-gradient(circle at left bottom, rgb(251 191 36 / 16%), transparent 34%),
    linear-gradient(165deg, rgb(255 255 255 / 24%), rgb(248 250 252 / 10%));
  box-shadow:
    0 18px 36px rgb(15 23 42 / 8%),
    inset 0 1px 0 rgb(255 255 255 / 46%);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.helper-metric-card:hover {
  transform: translateY(-2px);
  border-color: rgb(14 165 233 / 20%);
  box-shadow:
    0 22px 40px rgb(14 165 233 / 10%),
    inset 0 1px 0 rgb(255 255 255 / 52%);
}

.helper-metric-card span,
.helper-metric-card p {
  color: #64748b;
}

.helper-metric-card span {
  display: inline-flex;
  margin-bottom: 10px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.helper-metric-card strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.18rem;
  font-weight: 700;
}

.helper-metric-card p {
  margin: 10px 0 0;
  line-height: 1.5;
}

.helper-help-overlay {
  z-index: 999;
  position: fixed;
  pointer-events: none;
  border-width: 1px;
  border-radius: 18px;
  backdrop-filter: blur(4px);
}

.helper-tabs .ehp-tabs__header {
  margin: 0;
  display: flex;
  justify-content: center;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.helper-tabs .ehp-tabs__nav-wrap {
  display: flex;
  justify-content: center;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.helper-tabs .ehp-tabs__nav-wrap::after {
  display: none;
}

.helper-tabs .ehp-tabs__nav-scroll {
  display: inline-flex;
  justify-content: center;
  width: auto;
  max-width: 100%;
  margin: 0 auto;
  padding: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 74%);
  box-shadow:
    inset 0 0 0 1px rgb(148 163 184 / 18%),
    0 8px 18px rgb(15 23 42 / 5%);
}

.helper-tabs .ehp-tabs__nav {
  width: auto;
  justify-content: center;
  margin: 0 auto;
  gap: 8px;
  border: 0;
}

.helper-tabs .ehp-tabs__nav-prev,
.helper-tabs .ehp-tabs__nav-next {
  display: none;
}

.helper-tabs .ehp-tabs__active-bar {
  display: none;
}

.helper-tabs .ehp-tabs__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 18px !important;
  border-radius: 999px;
  color: #475569;
  line-height: 1.1;
  text-align: center;
  font-weight: 600;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.helper-tabs .ehp-tabs__item.is-top:first-child,
.helper-tabs .ehp-tabs__item.is-top:nth-child(2),
.helper-tabs .ehp-tabs__item.is-top:last-child {
  padding-left: 18px !important;
  padding-right: 18px !important;
}

.helper-tabs .ehp-tabs__item.is-active {
  background: linear-gradient(135deg, #0f766e, #0ea5e9);
  color: #fff;
  box-shadow: 0 6px 14px rgb(14 165 233 / 16%);
}

.helper-tabs .ehp-tabs__item:hover {
  color: #0f172a;
}

.helper-panel,
.helper-search-pane {
  margin-top: 18px;
  padding: 22px;
  border-radius: 26px;
  border: 1px solid rgb(148 163 184 / 18%);
  background: rgb(255 255 255 / 82%);
  box-shadow:
    0 22px 44px rgb(15 23 42 / 8%),
    inset 0 1px 0 rgb(255 255 255 / 72%);
  backdrop-filter: blur(18px);
}

.helper-search-pane {
  min-height: 120px;
}

.helper-panel--statistics {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.helper-panel--about {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.hp-about-box {
  display: flex;
}

.helper-dashboard .ehp-checkbox {
  color: #475569;
}

.helper-dashboard .ehp-checkbox.is-checked .ehp-checkbox__label {
  color: #0f172a !important;
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
  border-radius: 18px;
}

.helper-dashboard .ehp-tabs__content {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  overflow: unset !important;
}

html.dark {
  .helper-dashboard {
    color: #e2e8f0;
  }

  .helper-dashboard__copy {
    border-color: rgb(71 85 105 / 44%);
    background:
      radial-gradient(circle at top right, rgb(6 182 212 / 14%), transparent 32%),
      radial-gradient(circle at left bottom, rgb(168 85 247 / 12%), transparent 36%),
      linear-gradient(165deg, rgb(15 23 42 / 92%), rgb(30 41 59 / 94%));
    box-shadow:
      0 28px 60px rgb(2 6 23 / 42%),
      inset 0 1px 0 rgb(255 255 255 / 6%);
  }

  .helper-dashboard__eyebrow {
    color: #67e8f9;
  }

  .helper-dashboard__copy p,
  .helper-status-pill span,
  .helper-metric-card span,
  .helper-metric-card p,
  .helper-dashboard .ehp-checkbox {
    color: #94a3b8;
  }

  .helper-dashboard__summary,
  .helper-help-toggle,
  .helper-status-pill,
  .helper-panel,
  .helper-search-pane {
    background: rgb(15 23 42 / 66%);
    border-color: rgb(71 85 105 / 42%);
    box-shadow:
      inset 0 0 0 1px rgb(71 85 105 / 26%),
      0 24px 44px rgb(2 6 23 / 28%);
  }

  .helper-tabs .ehp-tabs__nav-scroll {
    background: rgb(15 23 42 / 66%);
    border-color: rgb(71 85 105 / 42%);
    box-shadow:
      inset 0 0 0 1px rgb(71 85 105 / 26%),
      0 10px 20px rgb(2 6 23 / 18%);
  }

  .helper-metric-card {
    border-color: rgb(71 85 105 / 42%);
    background:
      radial-gradient(circle at top right, rgb(6 182 212 / 12%), transparent 28%),
      radial-gradient(circle at left bottom, rgb(168 85 247 / 12%), transparent 34%),
      linear-gradient(165deg, rgb(15 23 42 / 28%), rgb(30 41 59 / 12%));
    box-shadow:
      0 24px 44px rgb(2 6 23 / 24%),
      inset 0 1px 0 rgb(255 255 255 / 6%);
  }

  .helper-metric-card:hover {
    border-color: rgb(34 211 238 / 28%);
    box-shadow:
      0 28px 48px rgb(8 145 178 / 18%),
      inset 0 1px 0 rgb(255 255 255 / 8%);
  }

  .helper-dashboard__summary {
    color: #e2e8f0 !important;
    background: rgb(14 165 233 / 18%);
  }

  .helper-dashboard .ehp-checkbox.is-checked .ehp-checkbox__label,
  .helper-tabs .ehp-tabs__item,
  .helper-tabs .ehp-tabs__item:hover {
    color: #e2e8f0 !important;
  }

  .helper-tabs .ehp-tabs__item.is-active {
    background: linear-gradient(135deg, #0891b2, #6366f1);
    box-shadow: 0 6px 14px rgb(99 102 241 / 18%);
  }

  .helper-help-toggle,
  .helper-status-pill {
    border-color: rgb(71 85 105 / 42%);
    background:
      radial-gradient(circle at top right, rgb(6 182 212 / 10%), transparent 32%),
      linear-gradient(165deg, rgb(15 23 42 / 72%), rgb(30 41 59 / 74%));
  }

  .helper-panel--statistics {
    border: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }
}

@media (max-width: 960px) {
  .helper-dashboard__toolbar,
  .helper-metric-grid {
    grid-template-columns: 1fr;
    display: grid;
  }

  .helper-dashboard__toolbar {
    justify-content: stretch;
  }

  .helper-help-toggle,
  .helper-status-pill {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .helper-dashboard__copy,
  .helper-panel,
  .helper-search-pane {
    padding: 18px;
    border-radius: 22px;
  }

  .helper-panel--statistics {
    padding: 0;
    border-radius: 0;
  }

  .helper-tabs .ehp-tabs__item {
    padding: 0 14px;
  }
}
</style>
