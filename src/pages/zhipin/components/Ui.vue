<script lang="ts" setup>
import { useMouse, useMouseInElement } from '@vueuse/core'
import {
  ElBadge,
  ElCheckbox,
  ElConfigProvider,
  ElLink,
  ElMessage,
  ElTabPane,
  ElTabs,
  ElTag,
  ElText,
  ElTooltip,
} from 'element-plus'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useModel } from '@/composables/useModel'
import { useStatistics } from '@/composables/useStatistics'
import { getActiveSiteAdapter } from '@/site-adapters'
import { useConf } from '@/stores/conf'
import { jobList } from '@/stores/jobs'
import { useSignedKey } from '@/stores/signedKey'
import { useUser } from '@/stores/user'
import elmGetter from '@/utils/elmGetter'
import { logger } from '@/utils/logger'
import { SELECTOR_TIMEOUT_MS } from '@/utils/selectors'

import { useDeliver } from '../hooks/useDeliver'
import { useDeliveryControl } from '../hooks/useDeliveryControl'
import { usePager } from '../hooks/usePager'
import About from './About.vue'
import Card from './Card.vue'
import Config from './Config.vue'
import Logs from './Logs.vue'
import Service from './Service.vue'
import Statistics from './Statistics.vue'

const user = useUser()
const model = useModel()
const signedKey = useSignedKey()
const { initPager } = usePager()
const { registerWindowAgentBridge } = useDeliveryControl()
const { x, y } = useMouse({ type: 'client' })
const deliver = useDeliver()
const { todayData } = useStatistics()
const conf = useConf()
let refreshSignedKeyTimer: ReturnType<typeof setInterval> | undefined
let unregisterAgentBridge: (() => void) | undefined

const helpVisible = ref(false)
const searchRef = ref()
const tabsRef = ref()
const helpContent = ref('鼠标移到对应元素查看提示')
const { isOutside } = useMouseInElement(tabsRef)

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

const boxStyles = computed(() => {
  if (helpVisible.value && !isOutside.value) {
    const element = document.elementFromPoint(x.value, y.value)
    const el = findHelp(element as HTMLElement)
    if (el) {
      const bounding = el.getBoundingClientRect()
      return {
        width: `${bounding.width}px`,
        height: `${bounding.height}px`,
        left: `${bounding.left}px`,
        top: `${bounding.top}px`,
        display: 'block',
        backgroundColor: '#3eaf7c33',
        transition: 'all 0.08s linear',
      } as Record<string, string | number>
    }
  }
  return {
    display: 'none',
  }
})

function findHelp(dom: HTMLElement | null) {
  if (!dom) return
  const help = dom.dataset.help
  if (help) {
    helpContent.value = help
    return dom
  }
  return findHelp(dom.parentElement)
}

onMounted(async () => {
  unregisterAgentBridge = registerWindowAgentBridge()
  void conf.confInit()
  void user.initUser()
  void user.initCookie()
  void model.initModel()
  void signedKey.initSignedKey()
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

  refreshSignedKeyTimer = setInterval(
    () => {
      void signedKey.refreshSignedKeyInfo()
    },
    1000 * 60 * 20,
  )
})

onUnmounted(() => {
  if (refreshSignedKeyTimer) {
    clearInterval(refreshSignedKeyTimer)
  }
  unregisterAgentBridge?.()
})

function tagOpen(url: string) {
  window.open(url)
}
const VITE_VERSION = __APP_VERSION__

const isDot = computed(() => {
  return (signedKey.netConf?.version ?? '0') > VITE_VERSION
})

function openStore() {
  window.__q_openStore?.()
}
</script>

<template>
  <ElConfigProvider namespace="ehp">
    <h2 style="display: flex; align-items: center">
      Helper
      <ElBadge
        :is-dot="isDot"
        :offset="[-2, 7]"
        style="cursor: pointer; display: inline-flex; margin: 0 4px"
        @click="openStore"
      >
        <ElTag type="primary"> v{{ VITE_VERSION }} {{ isDot ? ' 有更新' : '' }} </ElTag>
      </ElBadge>
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
    <div v-if="signedKey.netConf && signedKey.netConf.notification" class="netAlerts">
      <template
        v-for="item in signedKey.netConf.notification.filter((item) => item.type === 'alert')"
        :key="item.key ?? item.data.title"
      >
        <!-- <ElAlert
        v-if="now > GM_getValue(`netConf-${item.key}`, 0)"
        v-bind="item.data"
        @close="GM_setValue(`netConf-${item.key}`, now + 259200000)"
      /> -->
      </template>
    </div>
    <ElTooltip :visible="helpVisible && !isOutside" :virtual-ref="triggerRef">
      <template #content>
        <div :style="`width: auto;max-width:${boxStyles.width};font-size:17px;`">
          {{ helpContent }}
        </div>
      </template>
    </ElTooltip>
    <ElTabs ref="tabsRef" data-help="鼠标移到对应元素查看提示">
      <ElTabPane label="统计" data-help="失败是成功她妈">
        <Statistics />
      </ElTabPane>
      <ElTabPane ref="searchRef" label="筛选" />
      <ElTabPane label="配置" Alertdata-help="好好看，好好学">
        <Config />
      </ElTabPane>
      <ElTabPane v-if="signedKey.signedKey" label="AI" data-help="AI时代，脚本怎么能落伍!">
        <Service />
      </ElTabPane>
      <ElTabPane label="日志" data-help="反正你也不看">
        <Logs />
      </ElTabPane>
      <ElTabPane
        label="关于&赞赏"
        class="hp-about-box"
        data-help="项目是写不完美的,但总要去追求完美"
      >
        <About />
      </ElTabPane>
      <ElTabPane v-if="signedKey.netConf && signedKey.netConf.feedback">
        <template #label>
          <ElLink
            size="large"
            style="height: 100%"
            @click.stop="tagOpen(signedKey.netConf.feedback)"
          >
            反馈
          </ElLink>
        </template>
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
    <Teleport to="#boss-helper-job-warp,.page-job-inner .page-job-content">
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
