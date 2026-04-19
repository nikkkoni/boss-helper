<script lang="ts" setup>
import { ElCollapse, ElCollapseItem, ElForm, ElFormItem, ElInputNumber } from 'element-plus'

import Alert from '@/components/Alert'
import { useCommon } from '@/stores/common'
import { formInfoData, useConf } from '@/stores/conf'

import Ai from './Ai.vue'
import Appearance from './Appearance.vue'
import ConfigAmapSection from './config/ConfigAmapSection.vue'
import ConfigControlBar from './config/ConfigControlBar.vue'
import ConfigFilterSection from './config/ConfigFilterSection.vue'

const conf = useConf()
const { deliverLock } = useCommon()
</script>

<template>
  <Alert
    id="config-alert-1"
    style="margin-bottom: 10px"
    show-icon
    title="进行配置前都请先阅读完整的帮助文档，再进行配置，如有bug请反馈"
    type="success"
    description="滚动到底部，差不多150个岗位左右，也会自动停止, 刷新或者变更期望重新获取新的岗位即可。"
  />
  <Alert
    id="config-alert-3"
    style="margin-bottom: 10px"
    type="success"
    description="所有配置选项皆有帮助提示，不懂用法请进入帮助模式进行查看，若是对帮助说明有疑问请反馈最好能给出改进意见。"
  />
  <ElForm
    inline
    label-position="left"
    label-width="auto"
    :model="conf.formData"
    :disabled="deliverLock"
  >
    <ElCollapse accordion>
      <ElCollapseItem title="筛选配置" name="1">
        <ConfigFilterSection />
      </ElCollapseItem>
      <ElCollapseItem title="外观配置" name="5">
        <Appearance />
      </ElCollapseItem>
      <ConfigAmapSection v-if="conf.config_level.advanced" />
      <ElCollapseItem v-if="conf.config_level.advanced" title="AI配置" name="2">
        <Ai />
      </ElCollapseItem>
      <ElCollapseItem v-if="conf.config_level.intermediate" title="延迟配置" name="3">
        <ElFormItem
          v-for="(item, key) in formInfoData.delay"
          :key="key"
          :label="item.label"
          :data-help="item['data-help']"
        >
          <ElInputNumber
            v-model="conf.formData.delay[key]"
            :min="1"
            :max="99999"
            :disabled="item.disable"
          />
        </ElFormItem>
      </ElCollapseItem>
    </ElCollapse>

    <ConfigControlBar />
  </ElForm>
</template>
