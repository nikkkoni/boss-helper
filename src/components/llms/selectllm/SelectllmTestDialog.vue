<script lang="ts" setup>
import type { CheckboxValueType } from 'element-plus'
import {
  ElButton,
  ElDialog,
  ElMessage,
  ElPopover,
  ElSpace,
  ElTable,
  ElTableColumn,
} from 'element-plus'
import type { Ref } from 'vue'
import { reactive, ref } from 'vue'

import JobCard from '@/components/Jobcard.vue'
import { parseFiltering } from '@/composables/useApplying/utils'
import { useModel } from '@/composables/useModel'
import type { Prompt } from '@/composables/useModel/type'
import type { MyJobListData } from '@/stores/jobs'
import { jobList } from '@/stores/jobs'
import { logger } from '@/utils/logger'

const props = defineProps<{
  data: 'aiGreeting' | 'aiFiltering' | 'aiReply'
  state: {
    currentModel: Ref<string | undefined>
    message: Ref<string | Prompt>
    singleMode: Ref<'vip' | boolean>
  }
}>()

const open = defineModel<boolean>({ required: true })
const model = useModel()

interface TestData {
  key: string
  job: MyJobListData
  checked: CheckboxValueType
  loading: boolean
}

interface TestContent {
  time: string
  prompt?: string
  reasoning_content?: string | null
  content?: string
}

const testData = reactive<Array<TestData>>([])
const expandTestRowKeys = ref<string[]>([])
const testDataContent = reactive<Record<string, TestContent[]>>({})
const testJobLoading = ref(false)
const testJobStop = ref(true)

function handleExpandChange(row: TestData) {
  logger.info('handleExpandChange', row)
  if (expandTestRowKeys.value.includes(row.key)) {
    expandTestRowKeys.value = expandTestRowKeys.value.filter((value) => value !== row.key)
  } else {
    expandTestRowKeys.value.push(row.key)
  }
}

async function addTestJob(n: number) {
  testJobLoading.value = true
  try {
    let count = 0
    for (const item of jobList.list) {
      if (testData.some((value) => value.job.encryptJobId === item.encryptJobId)) {
        continue
      }
      if (item.card == null) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await item.getCard()
      }
      testData.push({ key: item.encryptJobId, job: item, checked: false, loading: false })
      testDataContent[item.encryptJobId] = []
      count += 1
      if (count >= n) {
        break
      }
    }
  } finally {
    testJobLoading.value = false
  }
}

async function testJob() {
  if (!testJobStop.value) {
    testJobStop.value = true
    return
  }
  testJobLoading.value = true
  testJobStop.value = false
  const currentModelData = model.modelData.find(
    (value) => props.state.currentModel.value === value.key,
  )
  if (
    props.state.singleMode.value !== 'vip' &&
    (!props.state.currentModel.value || !currentModelData)
  ) {
    testJobLoading.value = false
    testJobStop.value = true
    ElMessage.warning('请在上级弹窗右上角选择模型')
    return
  }
  try {
    const gpt = model.getModel(
      currentModelData!,
      props.state.message.value,
      props.state.singleMode.value === 'vip',
    )
    const handle = async (item: TestData) => {
      if (testJobStop.value) {
        return
      }
      try {
        item.loading = true
        let { content, prompt, reasoning_content } = await gpt.message(
          {
            data: {
              data: item.job,
              card: item.job.card!,
            },
            test: true,
            json: props.data === 'aiFiltering',
          },
          props.data,
        )
        if (props.data === 'aiFiltering' && content) {
          const { message } = parseFiltering(content)
          content = message ?? content
        }
        testDataContent[item.key].push({
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          prompt,
          reasoning_content,
          content,
        })
      } catch (error) {
        logger.error(error)
        ElMessage.error(error instanceof Error ? error.message : String(error))
      } finally {
        item.loading = false
      }
    }

    for (let index = 0; index < testData.length; index += 4) {
      const batch = testData.slice(index, index + 4)
      await Promise.all(batch.map(handle))
    }
  } catch (error) {
    logger.error(error)
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    testJobLoading.value = false
    testJobStop.value = true
  }
}

defineExpose({
  testJob,
  testJobLoading,
  testJobStop,
})
</script>

<template>
  <ElDialog
    v-model="open"
    title="Prompt 测试"
    width="800"
    height="80vh"
    align-center
    draggable
    :z-index="21"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
    :modal="false"
  >
    <ElSpace direction="horizontal" size="large">
      <ElButton :loading="testJobLoading" @click="addTestJob(1)"> 添加1个 </ElButton>
      <ElButton :loading="testJobLoading" @click="addTestJob(4)"> 添加4个 </ElButton>
      <ElButton type="primary" @click="testJob">
        {{ testJobStop ? '测试' : '停止' }}
      </ElButton>
    </ElSpace>
    <ElTable :data="testData" style="width: 100%">
      <ElTableColumn
        type="expand"
        row-key="key"
        :expand-row-keys="expandTestRowKeys"
        @expand-change="handleExpandChange"
      >
        <template #default="scope">
          <div class="test-content-wrapper">
            <div class="test-content-list">
              <div
                v-for="item in testDataContent[scope.row.key].slice(-3)"
                :key="item.time"
                class="test-content-item"
              >
                <div class="test-content-time">
                  {{ item.time }}
                </div>
                <div v-if="item.prompt" class="test-content-prompt" :title="item.prompt">
                  {{ item.prompt }}
                </div>
                <div
                  v-if="item.reasoning_content"
                  class="test-content-reasoning-content"
                  :title="item.reasoning_content"
                >
                  {{ item.reasoning_content }}
                </div>
                <div class="test-content-content" :title="item.content">
                  {{ item.content }}
                </div>
              </div>
            </div>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="job.jobName" label="岗位名" width="180">
        <template #default="scope">
          <ElPopover effect="light" trigger="hover" placement="top" popper-style="padding: 0;">
            <template #default>
              <JobCard :job="scope.row.job" :hover="false" style="width: 300px" />
            </template>
            <template #reference>
              <div style="display: flex; align-items: center">
                <svg
                  v-if="scope.row.loading"
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                >
                  <g
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  >
                    <path stroke-dasharray="16" stroke-dashoffset="16" d="M12 3c4.97 0 9 4.03 9 9">
                      <animate
                        fill="freeze"
                        attributeName="stroke-dashoffset"
                        dur="0.3s"
                        values="16;0"
                      />
                      <animateTransform
                        attributeName="transform"
                        dur="1.5s"
                        repeatCount="indefinite"
                        type="rotate"
                        values="0 12 12;360 12 12"
                      />
                    </path>
                    <path
                      stroke-dasharray="64"
                      stroke-dashoffset="64"
                      stroke-opacity=".3"
                      d="M12 3c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9c0 -4.97 4.03 -9 9 -9Z"
                    >
                      <animate
                        fill="freeze"
                        attributeName="stroke-dashoffset"
                        dur="1.2s"
                        values="64;0"
                      />
                    </path>
                  </g>
                </svg>
                {{ scope.row.job.jobName }}
              </div>
            </template>
          </ElPopover>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="job.card.postDescription" label="内容">
        <template #default="scope">
          <div :title="scope.row.job.card.postDescription" class="test-content-cell">
            {{ scope.row.job.card.postDescription }}
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
    <template #footer>
      <div>
        <ElButton @click="open = false"> 取消 </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped>
.test-content-wrapper {
  padding: 8px;
}

.test-content-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.test-content-item {
  display: flex;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}

.test-content-time,
.test-content-prompt,
.test-content-reasoning-content {
  width: 180px;
  border-right: 1px solid #dcdfe6;
  padding: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-content-time,
.test-content-prompt {
  width: 130px;
}

.test-content-reasoning-content {
  width: 200px;
}

.test-content-content,
.test-content-cell {
  flex: 1;
  padding: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
