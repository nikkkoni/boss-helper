<script lang="ts" setup>
import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElLink,
  ElRadioButton,
  ElRadioGroup,
  ElSelectV2,
  ElSpace,
  ElText,
} from 'element-plus'
import type { Ref } from 'vue'

import { useModel } from '@/composables/useModel'
import type { Prompt } from '@/composables/useModel/type'

const props = defineProps<{
  copyOnlineResume: () => Promise<void>
  data: 'aiFiltering'
  inputExample: () => void
  removeMessage: (item: Prompt[number]) => void
  roleOptions: { label: string; value: string }[]
  state: {
    currentModel: Ref<string | undefined>
    message: Ref<string | Prompt>
    score: Ref<number>
    singleMode: Ref<boolean>
  }
  addMessage: () => void
  changeMode: (value: boolean | string | number | undefined) => void
}>()

const model = useModel()
</script>

<template>
  <div v-if="data === 'aiFiltering'">
    <ElFormItem label="过滤分数">
      <ElInputNumber
        v-model="state.score.value"
        :precision="0"
        :min="-100"
        :max="100"
        size="small"
        placeholder="请输入分数"
      />
    </ElFormItem>
  </div>
  <div class="select-form-box">
    <ElRadioGroup
      v-model="state.singleMode.value"
      size="large"
      @update:model-value="(value) => changeMode(value)"
    >
      <ElRadioButton label="单对话模式" :value="true" />
      <ElRadioButton label="多对话模式" :value="false" />
    </ElRadioGroup>
    <ElSpace>
      <ElButton @click="inputExample"> 填入示例值 </ElButton>
      <ElButton @click="copyOnlineResume"> 复制在线简历 </ElButton>
    </ElSpace>
    <ElSelectV2
      v-model="state.currentModel.value"
      :options="model.modelData"
      :props="{ label: 'name', value: 'key' }"
      placeholder="选择模型"
      style="width: 35%"
    />
  </div>

  <ElText style="margin: 20px 0" tag="div">
    使用
    <ElLink type="primary" href="https://ygorko.github.io/mitem/" target="_blank"> mitem </ElLink>
    来渲染模板。在多对话模式下，只有最后的消息会使用模板。
    <ElLink
      type="primary"
      href="https://github.com/nikkkoni/boss-helper/blob/main/src/types/bossData.d.ts"
      target="_blank"
    >
      变量表
    </ElLink>
    <br />
    推荐阅读
    <ElLink
      type="primary"
      href="https://langgptai.feishu.cn/wiki/RXdbwRyASiShtDky381ciwFEnpe"
      target="_blank"
    >
      《LangGPT》
    </ElLink>
    的提示词文档学习 ( 示例提示词写的并不好,欢迎AI大佬来提pr )
  </ElText>
  <ElInput
    v-if="state.singleMode.value"
    v-model="state.message.value as string"
    style="width: 100%"
    :autosize="{ minRows: 10, maxRows: 18 }"
    type="textarea"
  />
  <ElForm v-else label-width="auto" class="demo-dynamic">
    <ElFormItem v-for="(item, index) in state.message.value as Prompt" :key="index">
      <template #label>
        <ElSelectV2 v-model="item.role" :options="roleOptions" style="width: 140px" />
      </template>
      <div class="select-form-box select-form-box-start">
        <ElInput v-model="item.content" type="textarea" :autosize="{ minRows: 2, maxRows: 8 }" />
        <ElButton style="margin-left: 10px" @click.prevent="removeMessage(item)"> 删除 </ElButton>
      </div>
    </ElFormItem>
    <ElFormItem>
      <ElButton @click="addMessage"> 添加消息 </ElButton>
    </ElFormItem>
  </ElForm>
</template>

<style scoped>
:deep(.ehp-alert--info.is-light),
:deep(.ehp-alert--info.is-light .ehp-alert__description) {
  white-space: pre-line;
}

.select-form-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.select-form-box-start {
  width: 100%;
  align-items: flex-start;
}
</style>
