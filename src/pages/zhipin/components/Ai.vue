<script lang="ts" setup>
import { ElButton, ElSpace } from 'element-plus'
import { ref } from 'vue'

import formSwitch from '@/components/form/FormSwitch.vue'
import configLLM from '@/components/llms/ConfigLLM.vue'
import selectLLM from '@/components/llms/Selectllm.vue'
import { useCommon } from '@/stores/common'
import { formInfoData, useConf } from '@/stores/conf'
import type { FormDataAi } from '@/types/formData'

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
  <ElSpace wrap fill :fill-ratio="32" style="width: 100%">
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
  </ElSpace>
  <div style="margin-top: 15px">
    <ElButton type="primary" data-help="配置需要使用的LLM大模型" @click="aiConfBoxShow = true">
      模型配置
    </ElButton>
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
:deep(.ehp-space .ehp-button-group) {
  display: flex;
  .ehp-button:first-child {
    flex: 1;
  }
}
</style>
