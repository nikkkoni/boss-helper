<script lang="ts" setup>
import {
  ElAvatar,
  ElButton,
  ElDialog,
  ElIcon,
  ElMessage,
  ElTable,
  ElTableColumn,
  ElText,
} from 'element-plus'
import { ref } from 'vue'

import SafeHtml from '@/components/SafeHtml.vue'
import type { modelData } from '@/composables/useModel'
import { llmIcon, useModel } from '@/composables/useModel'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import {
  exportJson,
  ImportJsonCancelledError,
  importJson,
} from '@/utils/jsonImportExport'

import CreateLLM from './CreateLLM.vue'

const show = defineModel<boolean>({ required: true })
const modelStore = useModel()

const createBoxShow = ref(false)

function createModelKey() {
  return crypto.randomUUID()
}

function del(d: modelData) {
  modelStore.modelData = modelStore.modelData.filter((v) => d.key !== v.key)
  ElMessage.success('删除成功')
}

function copy(d: modelData) {
  d = jsonClone(d)
  d.key = createModelKey()
  d.name = `${d.name} 副本`
  modelStore.modelData.push(d)
  ElMessage.success('复制成功')
}

const createModelData = ref()

function edit(d: modelData) {
  createModelData.value = d
  createBoxShow.value = true
}

function newllm() {
  createModelData.value = undefined
  createBoxShow.value = true
}

function create(d: modelData) {
  if (d.key) {
    const old = modelStore.modelData.find((v) => v.key === d.key)
    if (old) {
      deepmerge(old, d, { clone: false })
    } else {
      d.key = createModelKey()
      modelStore.modelData.push(d)
    }
  } else {
    d.key = createModelKey()
    modelStore.modelData.push(d)
  }
  createBoxShow.value = false
}

function close() {
  modelStore.initModel()
  show.value = false
}

function exportllm() {
  exportJson(jsonClone(modelStore.modelData), 'Ai模型配置')
}

function importllm() {
  importJson<modelData[]>()
    .then((data) => {
      modelStore.modelData = data
      ElMessage.success('导入成功, 请手动保存')
    })
    .catch((error) => {
      if (error instanceof ImportJsonCancelledError) {
        return
      }
      ElMessage.error(error instanceof Error ? error.message : '导入失败')
    })
}
</script>

<template>
  <ElDialog
    v-model="show"
    title="Ai模型配置"
    width="70%"
    align-center
    destroy-on-close
    :z-index="20"
  >
    <ElTable :data="modelStore.modelData" style="width: 100%" table-layout="auto">
      <ElTableColumn label="模型">
        <template #default="scope">
          <div style="align-items: center; display: flex">
            <ElAvatar :size="30" :style="{ '--el-avatar-bg-color': scope.row.color }">
              <ElIcon>
                <SafeHtml tag="span" variant="svg" :html="llmIcon[scope.row.data?.mode ?? '']" />
              </ElIcon>
            </ElAvatar>
            <span style="margin-left: 8px">{{ scope.row.name }}</span>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="描述">
        <template #default="scope">
          <ElText line-clamp="1">
            {{ scope.row.data?.url ?? '未配置地址' }}
          </ElText>
        </template>
      </ElTableColumn>
      <ElTableColumn label="管理">
        <template #default="scope">
          <div style="width: 200px">
            <ElButton link type="primary" size="small" @click="() => del(scope.row)">
              删除
            </ElButton>
            <ElButton link type="primary" size="small" @click="() => copy(scope.row)">
              复制
            </ElButton>
            <ElButton link type="primary" size="small" @click="() => edit(scope.row)">
              编辑
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
    <CreateLLM
      v-if="createBoxShow"
      v-model="createBoxShow"
      :model="createModelData"
      @create="create"
    />

    <template #footer>
      <div>
        <ElButton @click="close"> 取消 </ElButton>
        <ElButton type="success" @click="exportllm"> 导出 </ElButton>
        <ElButton type="success" @click="importllm"> 导入 </ElButton>
        <ElButton type="primary" @click="newllm"> 新建 </ElButton>
        <ElButton type="primary" @click="modelStore.saveModel"> 保存 </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style lang="scss" scoped></style>
