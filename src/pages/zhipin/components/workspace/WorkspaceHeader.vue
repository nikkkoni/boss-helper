<script lang="ts" setup>
import { ElCheckbox } from 'element-plus'
import { computed } from 'vue'

const props = defineProps<{
  helpVisible: boolean
  todayProgressLabel: string
  items: Array<{
    label: string
    value: string
    caption: string
    help: string
  }>
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
        <p>把筛选、统计、配置和日志整合进一个更清晰的工作台，减少在页面里来回寻找入口。</p>
      </div>

      <div class="workspace-overview__status-cluster">
        <p
          class="workspace-overview__summary bh-glass-surface bh-glass-surface--nested"
          data-help="这里显示今天已经完成的投递数量以及当前配置的上限。"
        >
          <span>今日投递</span>
          <strong>{{ todayProgressLabel }}</strong>
        </p>

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

    <div class="workspace-overview__metrics bh-workspace-metric-grid">
      <article
        v-for="item in items"
        :key="item.label"
        class="workspace-overview__metric bh-glass-surface bh-glass-surface--nested"
        :data-help="item.help"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.caption }}</p>
      </article>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.workspace-overview {
  padding: 24px;
}

.workspace-overview__header {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr);
  gap: 18px;
  align-items: start;
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

.workspace-overview__status-cluster {
  display: grid;
  gap: 12px;
}

.workspace-overview__summary,
.workspace-overview__control,
.workspace-overview__metric {
  min-width: 0;
  padding: 16px 18px;
}

.workspace-overview__summary {
  display: grid;
  gap: 6px;
  margin: 0;
  color: var(--bh-text-primary);
}

.workspace-overview__summary span,
.workspace-overview__metric span {
  display: inline-flex;
  color: var(--bh-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workspace-overview__summary strong {
  display: block;
  font-size: clamp(1.6rem, 1.2rem + 0.7vw, 2rem);
  line-height: 1;
}

.workspace-overview__control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workspace-overview__control-copy strong,
.workspace-overview__control-copy span,
.workspace-overview__metric strong,
.workspace-overview__metric p {
  display: block;
}

.workspace-overview__control-copy strong,
.workspace-overview__metric strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.98rem;
}

.workspace-overview__control-copy strong {
  margin-bottom: 2px;
}

.workspace-overview__control-copy span,
.workspace-overview__metric p {
  margin-top: 2px;
  color: var(--bh-text-muted);
  font-size: 0.84rem;
}

.workspace-overview__metrics {
  margin-top: 18px;
  gap: 14px;
}

.workspace-overview__metric {
  min-height: 148px;
}

.workspace-overview__metric strong {
  display: block;
  margin-top: 10px;
  font-size: 1.18rem;
  font-weight: 700;
}

.workspace-overview__metric p {
  margin: 10px 0 0;
  line-height: 1.5;
}

@media (max-width: 960px) {
  .workspace-overview__header {
    grid-template-columns: 1fr;
  }

  .workspace-overview__control {
    align-items: flex-start;
  }
}

@media (max-width: 640px) {
  .workspace-overview {
    padding: 18px;
    border-radius: 22px;
  }

  .workspace-overview__summary,
  .workspace-overview__control,
  .workspace-overview__metric {
    padding: 14px 16px;
  }

  .workspace-overview__control {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
