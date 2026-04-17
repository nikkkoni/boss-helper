<script lang="ts" setup>
import { useMouse, useMouseInElement } from '@vueuse/core'
import {
  ElCheckbox,
  ElConfigProvider,
  ElMessage,
  ElTabPane,
  ElTabs,
  ElText,
  ElTooltip,
} from 'element-plus'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

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
const { x, y } = useMouse({ type: 'client' })
const deliver = useDeliver()
const { todayData } = useStatistics()
const conf = useConf()
let unregisterAgentBridge: (() => void) | undefined

const helpVisible = ref(false)
const searchRef = ref()
const tabsRef = ref()
const helpContent = ref('鼠标移到对应元素查看提示')
const { isOutside } = useMouseInElement(tabsRef)
const currentHelpElement = shallowRef<HTMLElement | null>(null)
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
      return DOMRect.fromRect({
        width: 0,
        height: 0,
        x: x.value,
        y: y.value,
      })
    },
  }
})

const helpMaxWidth = computed(() =>
  typeof boxStyles.value.width === 'string' && boxStyles.value.width
    ? boxStyles.value.width
    : '320px',
)

function hideHelpBox() {
  currentHelpElement.value = null
  boxStyles.value = {
    display: 'none',
  }
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
  boxStyles.value = {
    width: `${bounding.width}px`,
    height: `${bounding.height}px`,
    left: `${bounding.left}px`,
    top: `${bounding.top}px`,
    display: 'block',
    backgroundColor: '#3eaf7c33',
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
    <h2 style="display: flex; align-items: center">
      Helper
      <ElText v-if="todayData.total > 0" style="margin-right: 15px">
        今日投递: {{ todayData.success }}/{{ conf.formData.deliveryLimit.value }}
      </ElText>
      <ElText v-if="deliver.total > 0">
        当前页面处理: {{ deliver.current + 1 }}/{{ deliver.total }}
      </ElText>
    </h2>
    <div
      style="z-index: 999; position: fixed; pointer-events: none; border-width: 1px"
      :style="boxStyles"
    />
    <ElTooltip :visible="helpVisible && !isOutside" :virtual-ref="triggerRef">
      <template #content>
        <div :style="`width: auto;max-width:${helpMaxWidth};font-size:17px;`">
          {{ helpContent }}
        </div>
      </template>
    </ElTooltip>
    <ElTabs ref="tabsRef" data-help="鼠标移到对应元素查看提示">
      <ElTabPane label="统计" data-help="失败是成功她妈">
        <Statistics />
      </ElTabPane>
      <ElTabPane ref="searchRef" label="筛选" />
      <ElTabPane label="配置" data-help="好好看，好好学">
        <Config />
      </ElTabPane>
      <ElTabPane label="日志" data-help="反正你也不看">
        <Logs />
      </ElTabPane>
      <ElTabPane
        label="关于"
        class="hp-about-box"
        data-help="项目是写不完美的,但总要去追求完美"
      >
        <About />
      </ElTabPane>
      <ElTabPane>
        <template #label>
          <ElCheckbox v-model="helpVisible" label="帮助" size="large" @click.stop="" />
        </template>
        我去, 给你发现小彩蛋了哇! 不过这里啥都没有, 但还是要谢谢你来查看帮助. 虽然点歪了一些些...
        <br />
        文案不理解的可以提供建议进行调整
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
  </ElConfigProvider>
</template>

<style lang="scss">
#boss-helper-job {
  margin-bottom: 8px;
  *:not(.ehp-tab-pane *) {
    user-select: none;
  }
}

.hp-about-box {
  display: flex;
  .hp-about {
    display: flex;
    flex-direction: column;
  }
  html.dark & {
    color: #cfd3dc;
  }
}

.ehp-checkbox {
  color: #5e5e5e;
  &.is-checked .ehp-checkbox__label {
    color: #000000 !important;
  }
  .dark &.is-checked .ehp-checkbox__label {
    color: #cfd3dc !important;
  }
}

.ehp-form {
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
.ehp-tabs__content {
  overflow: unset !important;
}
</style>
