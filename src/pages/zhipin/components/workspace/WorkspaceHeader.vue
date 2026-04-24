<script lang="ts" setup>
import { ElCheckbox } from 'element-plus'
import { computed } from 'vue'

const props = defineProps<{
  currentUserLabel: string
  helpVisible: boolean
  todayProgressLabel: string
}>()

const emit = defineEmits<{
  'update:helpVisible': [value: boolean]
}>()

const helpModel = computed({
  get: () => props.helpVisible,
  set: value => emit('update:helpVisible', value),
})
</script>

<template>
  <section
    class="workspace-overview bh-glass-surface bh-glass-surface--hero"
    data-help="这里集中展示当前工作台状态、帮助入口和关键概览。"
  >
    <div class="workspace-overview__header">
      <div class="workspace-overview__copy">
        <span class="workspace-overview__eyebrow bh-eyebrow">Boss Helper Workspace</span>
        <h2>投递控制台</h2>
        <p>把筛选、统计、配置和日志收进同一个工作台，保留核心信息，把重复说明尽量压到最少。</p>
      </div>

      <div class="workspace-overview__meta-row">
        <div
          class="workspace-overview__meta bh-glass-surface bh-glass-surface--nested"
          data-help="这里显示当前识别到的 Boss 账号。"
        >
          <span>当前账号</span>
          <strong>{{ currentUserLabel }}</strong>
        </div>
        <div
          class="workspace-overview__meta bh-glass-surface bh-glass-surface--nested"
          data-help="这里显示今日已完成投递数量与当前配置的上限。"
        >
          <span>今日投递</span>
          <strong>{{ todayProgressLabel }}</strong>
        </div>

        <label
          class="workspace-overview__control bh-glass-surface bh-glass-surface--nested"
          data-help="开启后，把鼠标悬停在控件上即可查看帮助说明。"
        >
          <div class="workspace-overview__control-copy">
            <strong>帮助模式</strong>
            <span>{{ helpVisible ? '悬停说明已开启' : '悬停说明已关闭' }}</span>
          </div>
          <ElCheckbox v-model="helpModel" label="悬停说明" size="large" @click.stop />
        </label>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.workspace-overview {
  padding: 24px;
}

.workspace-overview__header {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.workspace-overview__copy {
  min-width: 0;
}

.workspace-overview__eyebrow {
  margin-bottom: 10px;
}

.workspace-overview__copy h2 {
  margin: 0;
  font-size: clamp(1.6rem, 1.2rem + 1vw, 2.2rem);
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.workspace-overview__copy p {
  max-width: 760px;
  margin: 12px 0 0;
  color: var(--bh-text-secondary);
  line-height: 1.75;
}

.workspace-overview__meta-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 12px;
}

.workspace-overview__meta,
.workspace-overview__control {
  min-width: 0;
  min-height: 128px;
  padding: 16px 18px;
}

.workspace-overview__meta {
  display: grid;
  gap: 6px;
  flex: 1 1 200px;
  color: var(--bh-text-primary);
}

.workspace-overview__meta span {
  display: inline-flex;
  color: var(--bh-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workspace-overview__meta strong {
  display: block;
  font-size: clamp(1rem, 0.92rem + 0.45vw, 1.32rem);
  line-height: 1.3;
  word-break: break-word;
}

.workspace-overview__control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.workspace-overview__control-copy {
  min-width: 0;
}

.workspace-overview__control-copy strong,
.workspace-overview__control-copy span {
  display: block;
}

.workspace-overview__control-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 2px;
  font-size: 0.98rem;
}

.workspace-overview__control-copy span {
  margin-top: 2px;
  color: var(--bh-text-muted);
  font-size: 0.84rem;
}

@media (max-width: 960px) {
  .workspace-overview__control {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}

@media (max-width: 640px) {
  .workspace-overview {
    padding: 18px;
    border-radius: 22px;
  }

  .workspace-overview__meta,
  .workspace-overview__control {
    padding: 14px 16px;
  }

  .workspace-overview__control {
    grid-template-columns: 1fr;
    align-items: start;
  }
}
</style>
