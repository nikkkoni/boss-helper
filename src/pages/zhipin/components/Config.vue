<script lang="ts" setup>
import { ElForm } from 'element-plus'

import Alert from '@/components/Alert'
import { useCommon } from '@/stores/common'
import { useConf } from '@/stores/conf'

import Ai from './Ai.vue'
import ConfigControlBar from './config/ConfigControlBar.vue'
import ConfigFilterSection from './config/ConfigFilterSection.vue'
import WorkspaceSectionHeader from './workspace/WorkspaceSectionHeader.vue'

const conf = useConf()
const { deliverLock } = useCommon()
</script>

<template>
  <div class="config-page">
    <Alert
      id="config-alert-compact"
      class="config-page__notice"
      show-icon
      title="配置变更保存后会热更新；不确定的字段可打开帮助模式查看说明。"
      type="success"
    />

    <ElForm
      class="config-page__form"
      inline
      label-position="left"
      label-width="auto"
      :model="conf.formData"
      :disabled="deliverLock"
    >
      <section
        class="config-page__section bh-glass-surface bh-glass-surface--soft"
        data-test="config-basic-section"
      >
        <WorkspaceSectionHeader
          eyebrow="Setup"
          title="基础设置"
          :meta="deliverLock ? '运行中，部分配置已锁定' : '当前可编辑'"
          size="toolbar"
        />

        <ConfigControlBar />
      </section>

      <section
        class="config-page__section bh-glass-surface bh-glass-surface--soft"
        data-test="config-rules-section"
      >
        <WorkspaceSectionHeader
          eyebrow="Rules"
          title="筛选规则"
          :meta="conf.config_level.intermediate ? '关键词 / 范围 / 附加限制' : '核心规则'"
          size="toolbar"
        />

        <ConfigFilterSection />
      </section>

      <section
        v-if="conf.config_level.advanced"
        class="config-page__section bh-glass-surface bh-glass-surface--soft"
        data-test="config-ai-section"
      >
        <WorkspaceSectionHeader eyebrow="AI" title="AI 能力" meta="默认收起" size="toolbar" />

        <Ai />
      </section>
    </ElForm>
  </div>
</template>

<style lang="scss" scoped>
.config-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-page__notice {
  margin: 0;
}

.config-page__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.config-page__section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

@media (max-width: 640px) {
  .config-page__section {
    padding: 14px;
    border-radius: 20px;
  }
}
</style>
