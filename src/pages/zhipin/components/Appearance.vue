<script lang="ts" setup>
import { useFavicon, useStorageAsync, useTitle } from '@vueuse/core'
import { ElCheckbox } from 'element-plus'
import { watch, watchEffect } from 'vue'

import Alert from '@/components/Alert'
import { ExtStorage } from '@/message'
import { useConf } from '@/stores/conf'
import { useStatistics } from '@/stores/statistics'

import ConfigSectionCard from './config/ConfigSectionCard.vue'

const title = useTitle(undefined, { observe: true })
const { todayData } = useStatistics()
const { formData } = useConf()

const conf = useStorageAsync(
  'appearance-conf',
  {
    hideHeader: false,
    changeIcon: false,
    dynamicTitle: false,
    changeBackground: false,
    blurCard: false,
    listSink: false,
  },
  ExtStorage,
  { mergeDefaults: true },
)

watch(
  () => conf.value.changeIcon,
  (v) => {
    if (!v) {
      return
    }
    const icon = useFavicon()
    icon.value = 'https://onlinecalculator.cc/public/favicon.svg'
  },
)

watch(
  () => conf.value.hideHeader,
  (val) => {
    const h = document.getElementById('header')
    if (!h) return
    h.style.display = val ? 'none' : ''
  },
)

let dynamicTitle: ReturnType<typeof watchEffect> | null = null

watch(
  () => conf.value.dynamicTitle,
  (val) => {
    if (!val) {
      dynamicTitle?.stop()
    } else {
      dynamicTitle = watchEffect(() => {
        title.value = `${todayData.success}/${formData.deliveryLimit.value} - 在线计算器`
      })
    }
  },
)

let ticking = false

watch(
  () => conf.value.blurCard,
  (val) => {
    const card = document.querySelector<HTMLDivElement>('.boss-helper-card')
    const blur = card?.querySelector<HTMLDivElement>('.card-grid-overlay')
    if (!blur || !card) return
    if (!val) {
      blur.style.display = 'none'
      card.onmousemove = null
      card.onmouseleave = null
    } else {
      blur.style.display = 'unset'
      card.onmousemove = (e) => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const rect = card.getBoundingClientRect()
            card.style.setProperty('--x', `${e.clientX - rect.left}px`)
            card.style.setProperty('--y', `${e.clientY - rect.top}px`)
            card.style.setProperty('--r', '120px')
            ticking = false
          })
          ticking = true
        }
        card.onmouseleave = () => {
          card.style.setProperty('--r', '0px')
        }
      }
    }
  },
)

watch(
  () => conf.value.listSink,
  (val) => {
    const h = document.getElementById('boss-helper-job-wrap')
    if (!h) return
    h.style.marginBottom = val ? '300px' : 'unset'
  },
)
</script>

<template>
  <div class="config-appearance">
    <Alert
      id="appearance-alert-1"
      type="success"
      description="此处提供一些便捷的外观调整功能。目前出于开发阶段, 暂无帮助文档，自行探索. 自动保存"
    />

    <div class="config-appearance__grid">
      <ConfigSectionCard
        compact
        title="页面界面"
        description="控制顶部、标题和图标这类页面级反馈，适合优先调节。"
      >
        <div class="config-appearance__options">
          <ElCheckbox v-model="conf.hideHeader" label="隐藏头" border />
          <ElCheckbox v-model="conf.changeIcon" label="更换图标" border />
          <ElCheckbox v-model="conf.dynamicTitle" label="动态标题" border />
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        compact
        title="候选卡片"
        description="影响职位卡片和列表区域的展示层次，适合按个人阅读习惯调整。"
      >
        <div class="config-appearance__options">
          <ElCheckbox v-model="conf.blurCard" label="模糊卡片" border />
          <ElCheckbox v-model="conf.listSink" label="列表下沉" border />
        </div>
      </ConfigSectionCard>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.config-appearance {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-appearance__grid {
  display: grid;
  gap: 16px;
}

.config-appearance__options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
</style>
