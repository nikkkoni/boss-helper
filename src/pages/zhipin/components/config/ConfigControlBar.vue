<script lang="ts" setup>
import {
  ElButton,
  ElCheckbox,
  ElFormItem,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
} from 'element-plus'
import { ref } from 'vue'

import { getCacheManager } from '@/composables/useApplying'
import { formInfoData, useConf } from '@/stores/conf'

import ConfigSectionCard from './ConfigSectionCard.vue'

const conf = useConf()
const selectedTemplate = ref('')

function isMessageBoxCancel(error: unknown) {
  return error === 'cancel' || error === 'close'
}

async function saveConfigTemplate() {
  try {
    const { value } = await ElMessageBox.prompt('请输入模板名称', '保存配置模板', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '模板名称不能为空',
    })
    const templateName = value.trim()
    await conf.saveTemplate(templateName)
    selectedTemplate.value = templateName
  } catch (error: unknown) {
    if (!isMessageBoxCancel(error)) {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  }
}

async function applyConfigTemplate() {
  if (!selectedTemplate.value) {
    ElMessage.warning('请先选择配置模板')
    return
  }

  try {
    await conf.applyTemplate(selectedTemplate.value)
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function deleteConfigTemplate() {
  if (!selectedTemplate.value) {
    ElMessage.warning('请先选择配置模板')
    return
  }

  try {
    await ElMessageBox.confirm(`确认删除模板「${selectedTemplate.value}」吗？`, '删除配置模板', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await conf.deleteTemplate(selectedTemplate.value)
    selectedTemplate.value = ''
  } catch (error: unknown) {
    if (!isMessageBoxCancel(error)) {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  }
}
</script>

<template>
  <div class="config-control">
    <div class="config-control__grid">
      <ConfigSectionCard
        compact
        title="基础设置"
        description="决定展示层级、通知和缓存等全局行为，通常是进入配置页后的第一步。"
      >
        <div class="config-control__fields">
          <ElFormItem
            class="config-control__field config-control__field--narrow"
            label="配置级别"
            :data-help="formInfoData.config_level['data-help']"
          >
            <ElSelect v-model="conf.formData.config_level" class="config-control__select">
              <ElOption
                v-for="item in formInfoData.config_level.options"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem
            v-if="conf.config_level.intermediate"
            class="config-control__field config-control__field--narrow"
            :label="formInfoData.deliveryLimit.label"
          >
            <ElInputNumber
              v-bind="formInfoData.deliveryLimit"
              v-model="conf.formData.deliveryLimit.value"
              class="config-control__number"
              :min="1"
              :max="155"
              :step="10"
            />
          </ElFormItem>
          <div class="config-control__toggles">
            <ElCheckbox
              v-bind="formInfoData.notification"
              v-model="conf.formData.notification.value"
              border
            />
            <ElCheckbox
              v-if="conf.config_level.expert || conf.formData.useCache.value"
              v-bind="formInfoData.useCache"
              v-model="conf.formData.useCache.value"
              border
            />
          </div>
          <div v-if="conf.formData.useCache.value" class="config-control__button-row">
            <ElButton type="warning" @click="() => getCacheManager().clearCache()">
              清空缓存
            </ElButton>
          </div>
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        v-if="conf.config_level.intermediate"
        compact
        title="配置模板"
        description="保存多套可切换方案，应用模板时不会自动保存当前配置。"
      >
        <div class="config-control__fields">
          <ElFormItem
            class="config-control__field config-control__field--wide"
            label="配置模板"
            data-help="保存多套配置方案，应用模板不会自动保存当前配置"
          >
            <ElSelect
              v-model="selectedTemplate"
              class="config-control__select"
              clearable
              filterable
              placeholder="选择模板"
            >
              <ElOption v-for="name in conf.templateNames" :key="name" :label="name" :value="name" />
            </ElSelect>
          </ElFormItem>
          <div class="config-control__button-row">
            <ElButton type="primary" @click="saveConfigTemplate">
              保存为模板
            </ElButton>
            <ElButton type="success" :disabled="!selectedTemplate" @click="applyConfigTemplate">
              应用模板
            </ElButton>
            <ElButton
              type="danger"
              plain
              :disabled="!selectedTemplate"
              @click="deleteConfigTemplate"
            >
              删除模板
            </ElButton>
          </div>
        </div>
      </ConfigSectionCard>
    </div>

    <ConfigSectionCard
      compact
      title="快捷操作"
      description="保存、重载和导入导出都集中在这里，做完改动后建议优先保存一次。"
    >
      <div class="config-control__button-row config-control__button-row--wrap">
        <ElButton type="success" data-help="保存配置，会自动刷新页面。" @click="conf.confSaving">
          保存配置
        </ElButton>
        <ElButton type="warning" data-help="重新加载本地配置" @click="conf.confReload">
          重载配置
        </ElButton>
        <ElButton
          type="primary"
          data-help="不同版本的参数可能会调整, 更新之后一键应用, 不会覆盖主要筛选条件"
          @click="conf.confRecommend"
        >
          使用推荐配置
        </ElButton>
        <ElButton
          v-if="conf.config_level.intermediate"
          type="primary"
          data-help="互联网就是要分享"
          @click="conf.confExport"
        >
          导出配置
        </ElButton>
        <ElButton
          v-if="conf.config_level.intermediate"
          type="primary"
          data-help="互联网就是要分享"
          @click="conf.confImport"
        >
          导入配置
        </ElButton>
        <ElButton
          v-if="conf.config_level.advanced"
          type="danger"
          data-help="清空配置,不会帮你保存,可以重载恢复"
          @click="conf.confDelete"
        >
          清空配置
        </ElButton>
      </div>
    </ConfigSectionCard>
  </div>
</template>

<style lang="scss" scoped>
.config-control {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-control__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.config-control__fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.config-control__field {
  width: 100%;
  margin-right: 0;
  margin-bottom: 0;
}

.config-control__field--narrow {
  max-width: 240px;
}

.config-control__field :deep(.ehp-form-item__content),
.config-control__select,
.config-control__number,
.config-control__number :deep(.ehp-input-number) {
  width: 100%;
}

.config-control__toggles,
.config-control__button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.config-control__button-row :deep(.ehp-button + .ehp-button) {
  margin-left: 0;
}

@media (max-width: 960px) {
  .config-control__grid {
    grid-template-columns: 1fr;
  }
}
</style>
