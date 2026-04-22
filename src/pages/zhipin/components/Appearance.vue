<script lang="ts" setup>
import { ElCheckbox } from 'element-plus'

import Alert from '@/components/Alert'

import type { AppearanceConfig } from '../hooks/useAppearanceConfig'
import { useAppearanceConfig } from '../hooks/useAppearanceConfig'

import ConfigSectionCard from './config/ConfigSectionCard.vue'

type PageAppearanceKey = 'hideHeader' | 'changeIcon' | 'dynamicTitle'
type BoardAppearanceKey = 'blurCard' | 'listSink'
type AppearanceOption<Key extends keyof AppearanceConfig> = {
  key: Key
  label: string
  description: string
}

const { conf } = useAppearanceConfig()

const pageOptions: AppearanceOption<PageAppearanceKey>[] = [
  {
    key: 'hideHeader',
    label: '隐藏顶部栏',
    description: '隐藏 Boss 页顶部区域，减少视觉干扰。',
  },
  {
    key: 'changeIcon',
    label: '替换页签图标',
    description: '把当前标签页图标替换为自定义图标，方便在多标签场景里快速识别。',
  },
  {
    key: 'dynamicTitle',
    label: '动态标题',
    description: '把今日投递进度写入页面标题，切到后台标签页时也能快速查看。',
  },
]

const boardOptions: AppearanceOption<BoardAppearanceKey>[] = [
  {
    key: 'blurCard',
    label: '卡片聚光效果',
    description: '在候选岗位面板上启用聚光玻璃效果，突出鼠标当前位置。',
  },
  {
    key: 'listSink',
    label: '列表下沉',
    description: '给职位列表区域预留额外底部空间，减少候选卡片带与宿主内容的挤压。',
  },
]
</script>

<template>
  <div class="config-appearance">
    <Alert
      id="appearance-alert-1"
      type="success"
      description="这些选项只影响页面展示，不改变投递逻辑和数据结构；所有开关都会自动保存。"
    />

    <div class="config-appearance__grid">
      <ConfigSectionCard
        compact
        title="页面界面"
        description="控制顶部、标题和图标这类页面级反馈，适合优先调节。"
      >
        <template #actions>
          <span class="config-appearance__meta bh-workspace-meta-pill bh-glass-pill">页面级效果</span>
        </template>

        <div class="config-appearance__option-grid">
          <div
            v-for="option in pageOptions"
            :key="option.key"
            class="config-appearance__option bh-glass-surface bh-glass-surface--nested"
          >
            <div class="config-appearance__option-copy">
              <strong>{{ option.label }}</strong>
              <p>{{ option.description }}</p>
            </div>
            <ElCheckbox v-model="conf[option.key]" class="config-appearance__toggle" border>
              {{ conf[option.key] ? '开启' : '关闭' }}
            </ElCheckbox>
          </div>
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        compact
        title="候选卡片"
        description="影响职位卡片和列表区域的展示层次，适合按个人阅读习惯调整。"
      >
        <template #actions>
          <span class="config-appearance__meta bh-workspace-meta-pill bh-glass-pill">候选面板</span>
        </template>

        <div class="config-appearance__option-grid">
          <div
            v-for="option in boardOptions"
            :key="option.key"
            class="config-appearance__option bh-glass-surface bh-glass-surface--nested"
          >
            <div class="config-appearance__option-copy">
              <strong>{{ option.label }}</strong>
              <p>{{ option.description }}</p>
            </div>
            <ElCheckbox v-model="conf[option.key]" class="config-appearance__toggle" border>
              {{ conf[option.key] ? '开启' : '关闭' }}
            </ElCheckbox>
          </div>
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

.config-appearance__option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 12px;
}

.config-appearance__option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
  min-height: 132px;
}

.config-appearance__option-copy {
  min-width: 0;
}

.config-appearance__option-copy strong {
  display: block;
  color: var(--bh-text-primary);
  font-size: 0.96rem;
  line-height: 1.35;
}

.config-appearance__option-copy p {
  margin: 8px 0 0;
  color: var(--bh-text-muted);
  line-height: 1.6;
}

.config-appearance__toggle {
  margin: 0;
  align-self: start;
}

.config-appearance__toggle :deep(.ehp-checkbox__label) {
  padding-left: 6px;
  font-weight: 600;
}

@media (max-width: 640px) {
  .config-appearance__option {
    grid-template-columns: 1fr;
  }
}
</style>
