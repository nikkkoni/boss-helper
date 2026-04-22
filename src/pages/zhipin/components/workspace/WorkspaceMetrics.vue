<script lang="ts" setup>
defineProps<{
  items: Array<{
    label: string
    value: string
    caption: string
    help: string
  }>
}>()
</script>

<template>
  <div class="helper-metric-grid bh-workspace-metric-grid">
    <article
      v-for="item in items"
      :key="item.label"
      class="helper-metric-card bh-glass-surface bh-glass-surface--card bh-glass-raise"
      :data-help="item.help"
    >
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
      <p>{{ item.caption }}</p>
    </article>
  </div>
</template>

<style lang="scss">
.helper-metric-grid {
  gap: 14px;
}

.helper-metric-card {
  min-width: 0;
  min-height: 148px;
  padding: 16px 18px;
}

.helper-metric-card span,
.helper-metric-card p {
  color: var(--bh-text-muted);
}

.helper-metric-card span {
  display: inline-flex;
  margin-bottom: 10px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.helper-metric-card strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.18rem;
  font-weight: 700;
}

.helper-metric-card p {
  margin: 10px 0 0;
  line-height: 1.5;
}
</style>
