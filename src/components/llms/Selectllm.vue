<script lang="ts" setup>
import { ElButton, ElDialog, ElInput, ElMessage, ElMessageBox } from 'element-plus'
import { h, ref } from 'vue'

import type { Prompt } from '@/composables/useModel/type'
import { formInfoData, useConf } from '@/stores/conf'
import { useUser } from '@/stores/user'
import type { FormInfoAi } from '@/types/formData'

import SelectllmPromptEditor from './selectllm/SelectllmPromptEditor.vue'
import SelectllmTestDialog from './selectllm/SelectllmTestDialog.vue'

const props = defineProps<{
  data: 'aiGreeting' | 'aiFiltering' | 'aiReply'
}>()

const conf = useConf()

const show = defineModel<boolean>({ required: true })
const currentModel = ref(conf.formData[props.data].model)
const singleMode = ref(!Array.isArray(conf.formData[props.data].prompt))
const score = ref(props.data === 'aiFiltering' ? (conf.formData[props.data].score ?? 10) : 10)
const roleOptions = ['system', 'user', 'assistant'].map((item) => ({
  label: item,
  value: item,
}))

let initialMessage = conf.formData[props.data].prompt
if (Array.isArray(initialMessage)) {
  initialMessage = [...initialMessage].map((item) => ({ ...item }))
}
const message = ref<string | Prompt>(initialMessage)
const testDialog = ref(false)
const editorState = {
  currentModel,
  message,
  score,
  singleMode,
}

function inputExample() {
  message.value = (formInfoData[props.data] as FormInfoAi).example[singleMode.value ? 0 : 1]
}

function changeMode(value: boolean | string | number | undefined) {
  if (value) {
    message.value = ''
  } else {
    message.value = [
      { role: 'user', content: '' },
      { role: 'assistant', content: '' },
      { role: 'user', content: '' },
    ]
  }
}

function removeMessage(item: Prompt[number]) {
  if (Array.isArray(message.value)) {
    message.value = message.value.filter((value) => value !== item)
  }
}

function addMessage() {
  if (Array.isArray(message.value)) {
    message.value.push({ role: 'user', content: '' })
  }
}

function openTestDialog() {
  testDialog.value = true
}

async function savePrompt() {
  if (currentModel.value == null) {
    ElMessage.warning('请在右上角选择模型')
    return
  }
  conf.formData[props.data].model = currentModel.value
  conf.formData[props.data].prompt = message.value
  if (props.data === 'aiFiltering') {
    conf.formData[props.data].score = score.value
  }
  await conf.confSaving()
}

async function copyOnlineResume() {
  const resume = await useUser().getUserResumeString({})

  await ElMessageBox({
    title: '在线简历',
    message: () =>
      h(ElInput, {
        style: 'width: 100%',
        modelValue: resume,
        readonly: true,
        autosize: { minRows: 4, maxRows: 8 },
        type: 'textarea',
      }),
    customStyle: {
      width: '100%',
    },
    showCancelButton: true,
    confirmButtonText: '复制到剪切板',
    cancelButtonText: '取消',
  })
    .then(() => navigator.clipboard.writeText(resume))
    .catch(() => {})
}
</script>

<template>
  <ElDialog
    v-model="show"
    :title="formInfoData[data].label"
    width="70%"
    align-center
    destroy-on-close
    :z-index="20"
  >
    <SelectllmPromptEditor
      :copy-online-resume="copyOnlineResume"
      :data="data"
      :input-example="inputExample"
      :remove-message="removeMessage"
      :role-options="roleOptions"
      :state="editorState"
      :add-message="addMessage"
      :change-mode="changeMode"
    />

    <template #footer>
      <ElButton @click="show = false"> 关闭 </ElButton>
      <ElButton type="info" @click="openTestDialog"> 测试 </ElButton>
      <ElButton type="primary" @click="savePrompt"> 保存 </ElButton>
    </template>
  </ElDialog>

  <SelectllmTestDialog v-model="testDialog" :data="data" :state="editorState" />
</template>
