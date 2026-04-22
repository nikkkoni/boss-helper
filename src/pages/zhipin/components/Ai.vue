<script lang="ts" setup>
import { ElButton } from 'element-plus'
import { ref } from 'vue'

import formSwitch from '@/components/form/FormSwitch.vue'
import configLLM from '@/components/llms/ConfigLLM.vue'
import selectLLM from '@/components/llms/Selectllm.vue'
import { useCommon } from '@/stores/common'
import { formInfoData, useConf } from '@/stores/conf'
import type { FormDataAi } from '@/types/formData'

import ConfigSectionCard from './config/ConfigSectionCard.vue'

const conf = useConf()
const { deliverLock } = useCommon()
const aiBoxShow = ref(false)
const aiConfBoxShow = ref(false)
const aiBox = ref<'aiFiltering'>('aiFiltering')

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
      <div class="config-ai__switches">
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
      <div class="config-ai__actions">
        <ElButton type="primary" data-help="配置需要使用的LLM大模型" @click="aiConfBoxShow = true">
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

.config-ai__switches,
.config-ai__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

:deep(.ehp-button-group) {
  display: flex;
  max-width: 100%;
}

:deep(.ehp-button-group .ehp-button:first-child) {
  flex: 1;
}
</style>
