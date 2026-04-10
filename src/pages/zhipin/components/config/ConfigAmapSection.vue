<script lang="ts" setup>
import {
  ElButton,
  ElCheckbox,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElLink,
  ElMessage,
  ElTooltip,
  ElCollapseItem,
} from 'element-plus'
import { ref } from 'vue'

import Alert from '@/components/Alert'
import { formInfoData, useConf } from '@/stores/conf'
import { amapGeocode } from '@/utils/amap'
import { logger } from '@/utils/logger'

const conf = useConf()
const amapGeocodeLoading = ref(false)

async function amapGeocodeHandler() {
  amapGeocodeLoading.value = true
  try {
    const res = await amapGeocode(conf.formData.amap.origins)
    if (res) {
      conf.formData.amap.origins = res.location
    } else {
      ElMessage.error('获取地址失败')
    }
  } catch (error: unknown) {
    ElMessage.error('获取地址失败')
    logger.error(error)
  } finally {
    amapGeocodeLoading.value = false
  }
}
</script>

<template>
  <ElCollapseItem title="地址配置" name="4">
    <Alert id="config-amap-2" style="margin-bottom: 10px" show-icon type="info">
      <template #title>
        使用高德地图前 推荐结合工作地址包含使用, 需自行申请key,
        <br />
        <ElLink href="https://lbs.amap.com/dev/" target="_blank" type="warning">
          https://lbs.amap.com/dev/
        </ElLink>
        创建应用 -> 添加key -> Web服务
        <br />
        每日免费配额足够使用
      </template>
    </Alert>
    <Alert
      id="config-amap-ai"
      style="margin-bottom: 10px"
      :closable="false"
      type="info"
      description="AI Prompt 参考如下语法(仅筛选可用):
        直线距离: {{ amap.straightDistance }}km
        驾车距离: {{ amap.drivingDistance }}km
        驾车时间: {{ amap.drivingDuration }}分钟
        步行距离: {{ amap.walkingDistance }}km
        步行时间: {{ amap.walkingDuration }}分钟
        "
    />
    <ElCheckbox
      v-bind="formInfoData.amap.enable"
      v-model="conf.formData.amap.enable"
      border
      style="margin-right: 10px"
    />
    <ElFormItem v-bind="formInfoData.amap.key">
      <ElInput v-model.lazy="conf.formData.amap.key" />
    </ElFormItem>
    <br />
    <ElFormItem v-bind="formInfoData.amap.origins">
      <ElInput v-model.lazy="conf.formData.amap.origins" :disabled="amapGeocodeLoading">
        <template #append>
          <ElTooltip content="根据完整地址获取经纬度" placement="top">
            <ElButton type="primary" :loading="amapGeocodeLoading" @click="amapGeocodeHandler()">
              🤖
            </ElButton>
          </ElTooltip>
        </template>
      </ElInput>
    </ElFormItem>
    <ElFormItem v-bind="formInfoData.amap.straightDistance">
      <ElInputNumber
        v-model.lazy="conf.formData.amap.straightDistance"
        :precision="1"
        :max="1000"
        :min="0"
        :step="1"
      >
        <template #suffix>
          <span>km</span>
        </template>
      </ElInputNumber>
    </ElFormItem>
    <br />
    <ElFormItem v-bind="formInfoData.amap.drivingDistance">
      <ElInputNumber
        v-model.lazy="conf.formData.amap.drivingDistance"
        :precision="1"
        :max="1000"
        :min="0"
        :step="1"
      >
        <template #suffix>
          <span>km</span>
        </template>
      </ElInputNumber>
    </ElFormItem>
    <ElFormItem v-bind="formInfoData.amap.drivingDuration">
      <ElInputNumber
        v-model.lazy="conf.formData.amap.drivingDuration"
        :precision="2"
        :max="1440"
        :min="0"
        :step="30"
      >
        <template #suffix>
          <span>分钟</span>
        </template>
      </ElInputNumber>
    </ElFormItem>
    <br />
    <ElFormItem v-bind="formInfoData.amap.walkingDistance">
      <ElInputNumber
        v-model.lazy="conf.formData.amap.walkingDistance"
        :precision="1"
        :max="1000"
        :min="0"
        :step="1"
      >
        <template #suffix>
          <span>km</span>
        </template>
      </ElInputNumber>
    </ElFormItem>
    <ElFormItem v-bind="formInfoData.amap.walkingDuration">
      <ElInputNumber
        v-model.lazy="conf.formData.amap.walkingDuration"
        :precision="2"
        :max="1440"
        :min="0"
        :step="30"
      >
        <template #suffix>
          <span>分钟</span>
        </template>
      </ElInputNumber>
    </ElFormItem>
  </ElCollapseItem>
</template>
