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

import Alert from '@/components/Alert'
import SafeHtml from '@/components/SafeHtml.vue'
import { llmIcon, useModel } from '@/composables/useModel'
import type { Prompt } from '@/composables/useModel/type'
import { formInfoData } from '@/stores/conf'
import { useSignedKey } from '@/stores/signedKey'

const props = defineProps<{
  copyOnlineResume: () => Promise<void>
  data: 'aiGreeting' | 'aiFiltering' | 'aiReply'
  inputExample: () => void
  removeMessage: (item: Prompt[number]) => void
  roleOptions: { label: string; value: string }[]
  state: {
    currentModel: Ref<string | undefined>
    message: Ref<string | Prompt>
    score: Ref<number>
    singleMode: Ref<'vip' | boolean>
  }
  addMessage: () => void
  changeMode: (value: boolean | string | number | undefined) => void
}>()

const signedKey = useSignedKey()
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
      <ElRadioButton :disabled="signedKey == null" label="会员模式(无需Prompt)" value="vip" />
      <ElRadioButton label="单对话模式" :value="true" />
      <ElRadioButton label="多对话模式" :value="false" />
    </ElRadioGroup>
    <ElSpace>
      <ElButton v-if="state.singleMode.value !== 'vip'" @click="inputExample">
        填入示例值
      </ElButton>
      <ElButton @click="copyOnlineResume"> 复制在线简历 </ElButton>
    </ElSpace>
    <ElSelectV2
      v-if="state.singleMode.value !== 'vip'"
      v-model="state.currentModel.value"
      :options="model.modelData"
      :props="{ label: 'name', value: 'key' }"
      placeholder="选择模型"
      style="width: 35%"
    >
      <template #default="{ item }">
        <div style="display: flex">
          <span
            v-if="item.vip != null"
            style="align-items: center; display: inline-flex; margin-right: 6px"
          >
            <SafeHtml tag="span" variant="svg" :html="llmIcon.vip" />
          </span>
          <span>{{ item.name }}</span>
        </div>
      </template>
      <template #label="{ label, value }">
        <div style="display: flex">
          <span
            v-if="value.startsWith('vip-')"
            style="align-items: center; display: inline-flex; margin-right: 6px"
          >
            <SafeHtml tag="span" variant="svg" :html="llmIcon.vip" />
          </span>
          <span>{{ label }}</span>
        </div>
      </template>
    </ElSelectV2>
  </div>

  <ElText v-if="state.singleMode.value !== 'vip'" style="margin: 20px 0" tag="div">
    <Alert
      v-if="state.currentModel.value?.startsWith('vip-')"
      id="vip-alert"
      title="注意"
      type="warning"
    >
      会员模型暂时不支持输出 思考过程, 比如deepseekR1，但是不影响模型能力
    </Alert>
    使用
    <ElLink type="primary" href="https://ygorko.github.io/mitem/" target="_blank"> mitem </ElLink>
    来渲染模板。在多对话模式下，只有最后的消息会使用模板。
    <ElLink
      type="primary"
      href="https://github.com/Ocyss/boos-helper/blob/master/src/types/bossData.d.ts"
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
  <ElText v-else style="margin: 20px 0" tag="div">
    !(暂时不开放了，已有key用户不受影响)!
    仅需输入自然语言作为额外要求，其余Prompt将由后台全自动生成. 比如:
    <br />
    <template v-if="data === 'aiGreeting'"> 使用“你好”作为开头, 稍微幽默风趣一些 </template>
    <template v-else-if="data === 'aiFiltering'">
      我喜好AI相关的岗位, 喜欢
      Go，Rust，Python，TypeScript语言，不喜欢Java，C++，PHp，Nodejs,Javascript
    </template>
  </ElText>
  <ElInput
    v-if="state.singleMode.value === 'vip' || state.singleMode.value"
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
