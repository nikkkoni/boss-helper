<script lang="ts" setup>
import WorkspaceSectionHeader from '../workspace/WorkspaceSectionHeader.vue'

withDefaults(defineProps<{
  eyebrow?: string
  title: string
  description?: string
  compact?: boolean
}>(), {
  eyebrow: '',
  description: '',
  compact: false,
})
</script>

<template>
  <section
    class="config-section-card bh-glass-surface"
    :class="{
      'config-section-card--compact': compact,
      'bh-glass-surface--soft': compact,
      'bh-glass-surface--card': !compact,
    }"
  >
    <WorkspaceSectionHeader
      :eyebrow="eyebrow"
      :title="title"
      :description="description"
      :size="compact ? 'compact' : 'section'"
    >
      <template v-if="$slots.actions" #actions>
        <slot name="actions" />
      </template>
    </WorkspaceSectionHeader>

    <div class="config-section-card__body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="config-section-card__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style lang="scss" scoped>
.config-section-card {
  padding: 22px;
}

.config-section-card--compact {
  padding: 18px;
  border-radius: var(--bh-radius-card);
}

.config-section-card__body {
  min-width: 0;
}

.config-section-card__footer {
  margin-top: 18px;
}

@media (max-width: 640px) {
  .config-section-card,
  .config-section-card--compact {
    padding: 18px;
    border-radius: 20px;
  }
}
</style>
