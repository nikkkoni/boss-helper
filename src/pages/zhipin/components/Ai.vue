<script lang="ts" setup>
import { ElButton } from 'element-plus'
import { computed, ref } from 'vue'

import formSwitch from '@/components/form/FormSwitch.vue'
import configLLM from '@/components/llms/ConfigLLM.vue'
import selectLLM from '@/components/llms/Selectllm.vue'
import { useModel } from '@/composables/useModel'
import { useCommon } from '@/stores/common'
import { formInfoData, useConf } from '@/stores/conf'
import type { FormDataAi } from '@/types/formData'

import ConfigSectionCard from './config/ConfigSectionCard.vue'

const conf = useConf()
const { deliverLock } = useCommon()
const modelStore = useModel()
const aiBoxShow = ref(false)
const aiConfBoxShow = ref(false)
const aiBox = ref<'aiFiltering'>('aiFiltering')
const selectedModelName = computed(() => {
  const modelKey = conf.formData.aiFiltering.model
  if (!modelKey) {
    return '未选择模型'
  }

  return modelStore.modelData.find((item) => item.key === modelKey)?.name ?? '模型已不存在'
})
const modelSummary = computed(() => `${modelStore.modelData.length} 个模型`)

function change(v: Partial<FormDataAi>) {
  v.enable = !v.enable
  void conf.confSaving()
}
</script>

<template>
  <div class="config-ai">
    <ConfigSectionCard
      compact
      title="AI 筛选"
      description="开启后会把职位内容交给模型进一步判断，适合对文本质量要求更高的场景。"
    >
      <template #actions>
        <span class="config-ai__meta bh-glass-pill">能力开关</span>
      </template>

      <div class="config-ai__panel-grid">
        <div class="config-ai__status-card bh-glass-surface bh-glass-surface--nested">
          <span>当前状态</span>
          <strong>{{ conf.formData.aiFiltering.enable ? '已启用 AI 筛选' : '未启用 AI 筛选' }}</strong>
          <p>开启后会根据 Prompt 与阈值对岗位内容进行额外评分。</p>
        </div>

        <div class="config-ai__status-card bh-glass-surface bh-glass-surface--nested">
          <span>当前模型</span>
          <strong>{{ selectedModelName }}</strong>
          <p>使用前请确认模型地址、鉴权和 Prompt 已配置完成。</p>
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
      </div>
    </ConfigSectionCard>

    <ConfigSectionCard
      compact
      title="模型管理"
      description="集中维护需要使用的 LLM 模型、地址和鉴权信息。"
    >
      <template #actions>
        <span class="config-ai__meta bh-glass-pill">{{ modelSummary }}</span>
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

.config-ai__meta {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  color: var(--bh-text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
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

.config-ai__status-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.config-ai__status-card span {
  color: var(--bh-text-muted);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.config-ai__status-card strong {
  color: var(--bh-text-primary);
  font-size: 1rem;
  line-height: 1.35;
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
  display: block;
  color: var(--bh-text-primary);
  font-size: 0.95rem;
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
