<script lang="ts" setup>
import { ElForm, ElFormItem, ElInputNumber } from 'element-plus'

import Alert from '@/components/Alert'
import { useCommon } from '@/stores/common'
import { formInfoData, useConf } from '@/stores/conf'

import Ai from './Ai.vue'
import Appearance from './Appearance.vue'
import ConfigAmapSection from './config/ConfigAmapSection.vue'
import ConfigControlBar from './config/ConfigControlBar.vue'
import ConfigFilterSection from './config/ConfigFilterSection.vue'
import ConfigSectionCard from './config/ConfigSectionCard.vue'

const conf = useConf()
const { deliverLock } = useCommon()
</script>

<template>
  <div class="config-page">
    <div class="config-page__tips">
      <Alert
        id="config-alert-1"
        show-icon
        title="进行配置前都请先阅读完整的帮助文档，再进行配置，如有 bug 请反馈"
        type="success"
        description="滚动到底部，差不多 150 个岗位左右也会自动停止；刷新或者变更期望后，再重新获取新的岗位即可。"
      />
      <Alert
        id="config-alert-3"
        type="success"
        description="所有配置选项皆有帮助提示，不懂用法请进入帮助模式查看；如果对帮助说明有疑问，也欢迎直接反馈改进意见。"
      />
    </div>

    <ElForm
      class="config-page__form"
      inline
      label-position="left"
      label-width="auto"
      :model="conf.formData"
      :disabled="deliverLock"
    >
      <ConfigSectionCard
        eyebrow="Control Center"
        title="配置控制台"
        description="先设置配置级别、模板和全局操作，再继续细调下面的各个能力分组。"
      >
        <ConfigControlBar />
      </ConfigSectionCard>

      <div class="config-page__grid">
        <ConfigSectionCard
          class="config-page__card config-page__card--wide"
          eyebrow="Filtering"
          title="筛选配置"
          description="岗位命中、排除与限制条件都集中在这里，建议先定基础边界，再补充更细的限制。"
        >
          <ConfigFilterSection />
        </ConfigSectionCard>

        <ConfigSectionCard
          eyebrow="Appearance"
          title="外观配置"
          description="调整插件在页面里的展示方式，这里的设置会自动保存，适合随时微调。"
        >
          <Appearance />
        </ConfigSectionCard>

        <ConfigSectionCard
          v-if="conf.config_level.advanced"
          class="config-page__card config-page__card--wide"
          eyebrow="Location"
          title="地址配置"
          description="结合高德地图补足通勤距离与时间条件，进一步收紧筛选范围。"
        >
          <ConfigAmapSection />
        </ConfigSectionCard>

        <ConfigSectionCard
          v-if="conf.config_level.advanced"
          eyebrow="AI"
          title="AI 配置"
          description="管理 AI 筛选开关和模型配置，用于做更细的岗位内容判断。"
        >
          <Ai />
        </ConfigSectionCard>

        <ConfigSectionCard
          v-if="conf.config_level.intermediate"
          eyebrow="Delay"
          title="延迟配置"
          description="控制投递节奏和随机偏移，避免连续动作过于密集。"
        >
          <ConfigSectionCard
            compact
            title="投递节奏"
            description="建议先从默认值开始，再根据页面稳定性逐步调节。"
          >
            <div class="config-delay-grid">
              <ElFormItem
                v-for="(item, key) in formInfoData.delay"
                :key="key"
                class="config-delay-grid__item"
                :label="item.label"
                :data-help="item['data-help']"
              >
                <ElInputNumber
                  v-model="conf.formData.delay[key]"
                  class="config-delay-grid__input"
                  :min="item.min ?? 1"
                  :max="99999"
                  :disabled="item.disable"
                />
              </ElFormItem>
            </div>
          </ConfigSectionCard>
        </ConfigSectionCard>
      </div>
    </ElForm>
  </div>
</template>

<style lang="scss" scoped>
.config-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.config-page__tips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.config-page__form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.config-page__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.config-page__card--wide {
  grid-column: span 2;
}

.config-delay-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}

.config-delay-grid__item {
  width: 100%;
  margin-right: 0;
  margin-bottom: 0;
}

.config-delay-grid__item :deep(.ehp-form-item__content),
.config-delay-grid__input {
  width: 100%;
}

.config-delay-grid__input :deep(.ehp-input-number) {
  width: 100%;
}

@media (max-width: 960px) {
  .config-page__tips,
  .config-page__grid,
  .config-delay-grid {
    grid-template-columns: 1fr;
  }

  .config-page__card--wide {
    grid-column: auto;
  }
}
</style>
