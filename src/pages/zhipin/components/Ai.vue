<script lang="ts" setup>
import { ElButton } from 'element-plus'
import { computed, ref } from 'vue'

import formSwitch from '@/components/form/FormSwitch.vue'
import configLLM from '@/components/llms/ConfigLLM.vue'
import selectLLM from '@/components/llms/Selectllm.vue'
import { useModel } from '@/composables/useModel'
import { useCommon } from '@/stores/common'
import { formInfoData, useConf } from '@/stores/conf'
import type { FormDataAi, FormDataAiKey } from '@/types/formData'

import ConfigSectionCard from './config/ConfigSectionCard.vue'

const conf = useConf()
const { deliverLock } = useCommon()
const modelStore = useModel()
const aiBoxShow = ref(false)
const aiConfBoxShow = ref(false)
const aiBox = ref<FormDataAiKey>('aiFiltering')
const modelSummary = computed(() => `${modelStore.modelData.length} 个模型`)

function getSelectedModelName(modelKey: string | undefined) {
  if (!modelKey) {
    return '未选择模型'
  }

  return modelStore.modelData.find((item) => item.key === modelKey)?.name ?? '模型已不存在'
}

const selectedFilteringModelName = computed(() =>
  getSelectedModelName(conf.formData.aiFiltering.model),
)
const selectedGreetingModelName = computed(() =>
  getSelectedModelName(conf.formData.aiGreeting.model),
)
const greetingStatusTitle = computed(() => {
  if (conf.formData.aiGreeting.enable) {
    return 'AI 生成生效'
  }
  if (conf.formData.customGreeting.enable) {
    return '自定义招呼语生效'
  }
  return '未启用招呼语'
})
const greetingStatusDescription = computed(() => {
  if (conf.formData.aiGreeting.enable && conf.formData.customGreeting.enable) {
    return 'AI 打招呼独立生效，无需开启自定义招呼语；当前会优先发送 AI 生成内容。'
  }
  if (conf.formData.aiGreeting.enable) {
    return 'AI 打招呼已独立开启；不需要开启自定义招呼语。'
  }
  if (conf.formData.customGreeting.enable) {
    return '当前发送自定义文本或模板；如需 AI 生成，请开启 AI 打招呼并配置 Prompt。'
  }
  return '开启 AI 打招呼或自定义招呼语任一项即可发送开场消息。'
})

function change(v: Partial<FormDataAi>) {
  v.enable = !v.enable
  void conf.confSaving()
}
</script>

<template>
  <div class="config-ai">
    <ConfigSectionCard
      compact
      collapsible
      default-collapsed
      title="AI 能力"
      description="开启后会把职位内容交给模型进一步判断或生成投递后的开场消息。"
    >
      <template #actions>
        <span class="config-ai__meta bh-workspace-meta-pill bh-glass-pill">能力开关</span>
      </template>

      <div class="config-ai__panel-grid">
        <div class="config-ai__status-card bh-workspace-stat-card bh-glass-surface bh-glass-surface--nested">
          <span>当前状态</span>
          <strong>{{ conf.formData.aiFiltering.enable ? '已启用 AI 筛选' : '未启用 AI 筛选' }}</strong>
          <p>开启后会根据 Prompt 与阈值对岗位内容进行额外评分。</p>
        </div>

        <div class="config-ai__status-card bh-workspace-stat-card bh-glass-surface bh-glass-surface--nested">
          <span>招呼语状态</span>
          <strong>{{ greetingStatusTitle }}</strong>
          <p>{{ greetingStatusDescription }}</p>
        </div>

        <div class="config-ai__status-card bh-workspace-stat-card bh-glass-surface bh-glass-surface--nested">
          <span>筛选模型</span>
          <strong>{{ selectedFilteringModelName }}</strong>
          <p>用于岗位内容评分。</p>
        </div>

        <div class="config-ai__status-card bh-workspace-stat-card bh-glass-surface bh-glass-surface--nested">
          <span>招呼语模型</span>
          <strong>{{ selectedGreetingModelName }}</strong>
          <p>用于生成开场消息。</p>
        </div>
      </div>

      <div class="config-ai__switches bh-glass-surface bh-glass-surface--nested">
        <formSwitch
          :label="formInfoData.aiFiltering.label"
          :data-help="formInfoData.aiFiltering['data-help']"
          :data="conf.formData.aiFiltering"
          :lock="deliverLock"
          @show="
            () => {
              aiBox = 'aiFiltering'
              aiBoxShow = true
            }
          "
          @change="change"
        />
        <formSwitch
          :label="formInfoData.aiGreeting.label"
          :data-help="formInfoData.aiGreeting['data-help']"
          :data="conf.formData.aiGreeting"
          :lock="deliverLock"
          @show="
            () => {
              aiBox = 'aiGreeting'
              aiBoxShow = true
            }
          "
          @change="change"
        />
      </div>
    </ConfigSectionCard>

    <ConfigSectionCard
      compact
      collapsible
      default-collapsed
      title="模型管理"
      description="集中维护需要使用的 LLM 模型、地址和鉴权信息。"
    >
      <template #actions>
        <span class="config-ai__meta bh-workspace-meta-pill bh-glass-pill">{{ modelSummary }}</span>
      </template>

      <div class="config-ai__actions bh-glass-surface bh-glass-surface--nested">
        <div class="config-ai__actions-copy">
          <strong>模型资源中心</strong>
          <p>在这里统一维护 LLM 服务地址、密钥和模型列表，供 AI 筛选等能力复用。</p>
        </div>
        <ElButton type="primary" data-help="打开模型配置，维护需要使用的 LLM 服务、地址和鉴权信息。" @click="aiConfBoxShow = true">
          模型配置
        </ElButton>
      </div>
    </ConfigSectionCard>
  </div>

  <configLLM v-model="aiConfBoxShow" />
  <selectLLM
    v-if="aiBoxShow"
    v-model="aiBoxShow"
    :key="aiBox"
    :data="aiBox"
  />
</template>

<style lang="scss" scoped>
.config-ai {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-ai__panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.config-ai__status-card,
.config-ai__switches,
.config-ai__actions {
  padding: 14px;
}

.config-ai__status-card span {
  display: inline-flex;
}

.config-ai__status-card strong {
  font-size: 1rem;
}

.config-ai__status-card p,
.config-ai__actions-copy p {
  margin: 0;
  color: var(--bh-text-muted);
  line-height: 1.6;
}

.config-ai__switches,
.config-ai__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.config-ai__actions-copy {
  min-width: 0;
}

.config-ai__actions-copy strong {
  margin-bottom: 8px;
}

:deep(.ehp-button-group) {
  display: flex;
  max-width: 100%;
}

:deep(.ehp-button-group .ehp-button:first-child) {
  flex: 1;
}

@media (max-width: 640px) {
  .config-ai__actions {
    align-items: stretch;
  }
}
</style>
