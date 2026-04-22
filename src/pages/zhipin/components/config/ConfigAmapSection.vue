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
} from 'element-plus'
import { ref } from 'vue'

import Alert from '@/components/Alert'
import { formInfoData, useConf } from '@/stores/conf'
import { amapGeocode } from '@/utils/amap'
import { logger } from '@/utils/logger'

import ConfigSectionCard from './ConfigSectionCard.vue'

const conf = useConf()
const amapGeocodeLoading = ref(false)
const promptExamples = [
  '直线距离: {{ amap.straightDistance }}km',
  '驾车距离: {{ amap.drivingDistance }}km',
  '驾车时间: {{ amap.drivingDuration }}分钟',
  '步行距离: {{ amap.walkingDistance }}km',
  '步行时间: {{ amap.walkingDuration }}分钟',
]

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
  <div class="config-amap">
    <div class="config-amap__grid">
      <ConfigSectionCard
        compact
        title="接入设置"
        description="先开启功能并配置 Key，再用完整地址换算出起点经纬度。"
      >
        <div class="config-amap__stack">
          <Alert id="config-amap-2" show-icon type="info">
            <template #title>
              使用高德地图前推荐结合工作地址包含使用，需自行申请 key，
              <br />
              <ElLink href="https://lbs.amap.com/dev/" target="_blank" type="warning">
                https://lbs.amap.com/dev/
              </ElLink>
              创建应用 -> 添加 key -> Web 服务
              <br />
              每日免费配额足够使用
            </template>
          </Alert>

          <div class="config-amap__fields">
            <div class="config-amap__toggle">
              <ElCheckbox
                v-bind="formInfoData.amap.enable"
                v-model="conf.formData.amap.enable"
                border
              />
            </div>
            <ElFormItem class="config-amap__field config-amap__field--wide" v-bind="formInfoData.amap.key">
              <ElInput v-model.lazy="conf.formData.amap.key" />
            </ElFormItem>
            <ElFormItem class="config-amap__field config-amap__field--wide" v-bind="formInfoData.amap.origins">
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
          </div>
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        compact
        title="通勤阈值"
        description="分别设置直线、驾车和步行的距离或时间上限。"
      >
        <div class="config-amap__fields config-amap__fields--metrics">
          <ElFormItem class="config-amap__field" v-bind="formInfoData.amap.straightDistance">
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
          <ElFormItem class="config-amap__field" v-bind="formInfoData.amap.drivingDistance">
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
          <ElFormItem class="config-amap__field" v-bind="formInfoData.amap.drivingDuration">
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
          <ElFormItem class="config-amap__field" v-bind="formInfoData.amap.walkingDistance">
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
          <ElFormItem class="config-amap__field" v-bind="formInfoData.amap.walkingDuration">
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
        </div>
      </ConfigSectionCard>
    </div>

    <ConfigSectionCard
      compact
      title="AI Prompt 参考"
      description="以下变量仅在筛选场景可用，可直接写进 Prompt 中。"
    >
      <div class="config-amap__token-list">
        <code v-for="token in promptExamples" :key="token" class="config-amap__token">
          {{ token }}
        </code>
      </div>
    </ConfigSectionCard>
  </div>
</template>

<style lang="scss" scoped>
.config-amap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-amap__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.config-amap__stack,
.config-amap__fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.config-amap__fields--metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}

.config-amap__toggle,
.config-amap__field {
  width: 100%;
}

.config-amap__field {
  margin-right: 0;
  margin-bottom: 0;
}

.config-amap__field :deep(.ehp-form-item__content),
.config-amap__field :deep(.ehp-input),
.config-amap__field :deep(.ehp-input-number) {
  width: 100%;
}

.config-amap__token-list {
  display: grid;
  gap: 10px;
}

.config-amap__token {
  display: block;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgb(15 23 42 / 4%);
  color: #0f172a;
  font-size: 0.92rem;
  line-height: 1.6;
  word-break: break-word;
}

:global(html.dark) .config-amap__token {
  background: rgb(148 163 184 / 10%);
  color: #e2e8f0;
}

@media (max-width: 960px) {
  .config-amap__grid,
  .config-amap__fields--metrics {
    grid-template-columns: 1fr;
  }
}
</style>
