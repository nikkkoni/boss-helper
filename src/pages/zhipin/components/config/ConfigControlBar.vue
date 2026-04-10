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
  <div style="margin-top: 20px; display: flex; gap: 20px; flex-wrap: wrap">
    <ElFormItem label="配置级别" :data-help="formInfoData.config_level['data-help']">
      <ElSelect v-model="conf.formData.config_level" style="width: 120px">
        <ElOption
          v-for="item in formInfoData.config_level.options"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </ElSelect>
    </ElFormItem>
    <ElCheckbox v-bind="formInfoData.notification" v-model="conf.formData.notification.value" border />
    <ElCheckbox
      v-if="conf.config_level.expert || conf.formData.useCache.value"
      v-bind="formInfoData.useCache"
      v-model="conf.formData.useCache.value"
      border
    />
    <ElButton
      v-if="conf.formData.useCache.value"
      type="warning"
      @click="() => getCacheManager().clearCache()"
    >
      清空缓存
    </ElButton>
    <ElFormItem v-if="conf.config_level.intermediate" :label="formInfoData.deliveryLimit.label">
      <ElInputNumber
        v-bind="formInfoData.deliveryLimit"
        v-model="conf.formData.deliveryLimit.value"
        :min="1"
        :max="155"
        :step="10"
      />
    </ElFormItem>
    <ElFormItem
      v-if="conf.config_level.intermediate"
      label="配置模板"
      data-help="保存多套配置方案，应用模板不会自动保存当前配置"
    >
      <ElSelect
        v-model="selectedTemplate"
        clearable
        filterable
        placeholder="选择模板"
        style="width: 180px"
      >
        <ElOption v-for="name in conf.templateNames" :key="name" :label="name" :value="name" />
      </ElSelect>
    </ElFormItem>
    <ElButton v-if="conf.config_level.intermediate" type="primary" @click="saveConfigTemplate">
      保存为模板
    </ElButton>
    <ElButton
      v-if="conf.config_level.intermediate"
      type="success"
      :disabled="!selectedTemplate"
      @click="applyConfigTemplate"
    >
      应用模板
    </ElButton>
    <ElButton
      v-if="conf.config_level.intermediate"
      type="danger"
      plain
      :disabled="!selectedTemplate"
      @click="deleteConfigTemplate"
    >
      删除模板
    </ElButton>
  </div>
  <div style="margin-top: 15px">
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
</template>
