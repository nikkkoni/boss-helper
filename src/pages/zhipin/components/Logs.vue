<script lang="ts" setup>
import type { TableV2Instance } from 'element-plus'
import {
  ElAutoResizer,
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElDialog,
  ElTableV2,
  ElTabPane,
  ElTabs,
} from 'element-plus'
import { ref } from 'vue'

import JobCard from '@/components/Jobcard.vue'
import { useLog } from '@/stores/log'

import WorkspaceSectionHeader from './workspace/WorkspaceSectionHeader.vue'

const tableRef = ref<TableV2Instance>()
const { filterData, columns, dialogData } = useLog()

const aiFilterActiveNames = ref('response')
const formatJson = (value: unknown) => JSON.stringify(value, null, 2)

// watchEffect(() => {
//   tableRef.value?.scrollToRow(data.value.length - 1);
// });
</script>

<template>
  <div class="logs-workbench">
    <section class="logs-workbench__table-shell bh-glass-surface bh-glass-surface--card">
      <WorkspaceSectionHeader
        eyebrow="Run Logs"
        title="运行日志"
        description="按时间顺序查看当前页面的处理记录、错误信息和 AI 过滤细节。"
        :meta="`${filterData.length} 条记录`"
      />

      <ElAutoResizer :disable-height="true">
        <template #default="{ width }">
          <ElTableV2 ref="tableRef" :columns="columns" :data="filterData" :height="360" :width />
        </template>
      </ElAutoResizer>
    </section>
  </div>
  <ElDialog
    v-model="dialogData.show"
    title="日志详情"
    width="80%"
    class="bh-glass-dialog logs-workbench__dialog"
  >
    <div class="log-detail">
      <div class="log-detail-left">
        <WorkspaceSectionHeader
          eyebrow="Job Snapshot"
          title="岗位快照"
          description="保留当前日志对应的岗位卡片结构，便于对照岗位上下文。"
          size="compact"
        />
        <JobCard v-if="dialogData.data?.job" :job="dialogData.data.job" />
      </div>
      <div class="log-detail-right bh-glass-surface bh-glass-surface--nested">
        <WorkspaceSectionHeader
          eyebrow="Details"
          title="日志详情"
          description="查看 AI 过滤内容、错误详情和结构化异常信息。"
          size="compact"
        />

        <ElTabs class="demo-tabs">
          <ElTabPane v-if="dialogData.data?.data?.aiFilteringQ" label="AI过滤" name="first">
            <ElCollapse v-model="aiFilterActiveNames" accordion>
              <ElCollapseItem title="Prompt" name="prompt">
                <div class="ai-text">
                  {{ dialogData.data.data.aiFilteringQ }}
                </div>
              </ElCollapseItem>
              <ElCollapseItem
                v-if="dialogData.data.data.aiFilteringR"
                title="思考过程"
                name="thinking"
              >
                <div class="ai-text">
                  {{ dialogData.data.data.aiFilteringR }}
                </div>
              </ElCollapseItem>
              <ElCollapseItem title="响应" name="response" class="active">
                <div class="ai-text">
                  {{ dialogData.data.data.aiFilteringAtext }}
                </div>
              </ElCollapseItem>
            </ElCollapse>
          </ElTabPane>
          <ElTabPane v-if="dialogData.data?.data?.err" label="错误信息" name="fourth">
            <div>
              {{ dialogData.data.data.err }}
            </div>
            <div v-if="dialogData.data?.data?.message">
              {{ dialogData.data.data.message }}
            </div>
            <div v-if="dialogData.data?.data?.pipelineError" class="ai-text">
              {{ formatJson(dialogData.data.data.pipelineError) }}
            </div>
          </ElTabPane>
        </ElTabs>
      </div>
    </div>
    <template #footer>
      <ElButton @click="dialogData.show = false"> 关闭 </ElButton>
    </template>
  </ElDialog>
</template>

<style lang="scss" scoped>
.logs-workbench {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.logs-workbench__table-shell {
  padding: 18px;
}

.logs-workbench :deep(.ehp-table-v2__header-row),
.logs-workbench :deep(.ehp-table-v2__row) {
  border-radius: var(--bh-radius-md);
}

.logs-workbench :deep(.ehp-table-v2__header-cell),
.logs-workbench :deep(.ehp-table-v2__row-cell) {
  padding-block: 12px;
}

:deep(.logs-workbench__dialog.ehp-dialog) {
  border-radius: var(--bh-radius-dialog);
}

:deep(.logs-workbench__dialog .ehp-dialog__body) {
  padding-top: 10px;
}

:deep(.ehp-table-v2__row-depth-0) {
  height: 50px;
}

:deep(.ehp-table-v2__cell-text) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-detail {
  display: flex;
  gap: 20px;
  min-height: 500px;

  &-left {
    flex: 0 0 350px;
    display: flex;
    flex-direction: column;
  }

  &-right {
    flex: 1;
    overflow-y: auto;
    padding: 18px;
  }
}

.log-detail-left,
.log-detail-right {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-text {
  white-space: pre-wrap;
  user-select: text;
  padding: 14px;
  line-height: 1.6;
  border-radius: var(--bh-radius-md);
  background: var(--bh-surface-muted);
}

:global(html.dark) .ai-text {
  background: rgb(15 23 42 / 62%);
}

.logs-workbench :deep(.ehp-collapse-item__header) {
  min-height: 46px;
  padding-block: 6px;
}

.logs-workbench :deep(.ehp-tabs__item) {
  min-height: 40px;
}

:deep(.ehp-collapse-item.active) {
  .ehp-collapse-item__header {
    border-bottom-color: transparent;
  }
}

@media (max-width: 960px) {
  .log-detail {
    flex-direction: column;
  }

  .log-detail-left {
    flex-basis: auto;
  }
}
</style>
