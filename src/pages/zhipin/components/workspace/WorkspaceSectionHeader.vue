<script lang="ts" setup>
withDefaults(
  defineProps<{
    eyebrow?: string
    title: string
    description?: string
    meta?: string
    size?: 'section' | 'compact'
  }>(),
  {
    eyebrow: '',
    description: '',
    meta: '',
    size: 'section',
  },
)
</script>

<template>
  <header
    class="workspace-section-header"
    :class="[
      `workspace-section-header--${size}`,
      {
        'workspace-section-header--split': $slots.actions || meta,
      },
    ]"
  >
    <div class="workspace-section-header__copy">
      <span v-if="eyebrow" class="workspace-section-header__eyebrow bh-eyebrow">{{ eyebrow }}</span>
      <div class="workspace-section-header__title-row">
        <h3>{{ title }}</h3>
        <slot name="title-extra" />
      </div>
      <p v-if="description">{{ description }}</p>
    </div>

    <div v-if="$slots.actions || meta" class="workspace-section-header__actions">
      <span v-if="meta" class="workspace-section-header__meta bh-glass-pill">{{ meta }}</span>
      <slot name="actions" />
    </div>
  </header>
</template>

<style lang="scss" scoped>
.workspace-section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

.workspace-section-header__copy {
  flex: 1 1 320px;
  min-width: 0;
  max-width: 720px;
}

.workspace-section-header__eyebrow {
  margin-bottom: 8px;
}

.workspace-section-header__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.workspace-section-header__copy h3 {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.2;
  color: var(--bh-text-primary);
}

.workspace-section-header__copy p {
  max-width: 62ch;
  margin: 10px 0 0;
  color: var(--bh-text-muted);
  line-height: 1.7;
}

.workspace-section-header__actions {
  flex: 0 0 auto;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.workspace-section-header__meta {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 14px;
  color: var(--bh-text-secondary);
  font-size: 0.83rem;
  font-weight: 600;
}

.workspace-section-header--compact {
  gap: 12px;
  margin-bottom: 14px;
}

.workspace-section-header--compact .workspace-section-header__eyebrow {
  margin-bottom: 6px;
}

.workspace-section-header--compact .workspace-section-header__copy h3 {
  font-size: 1rem;
}

.workspace-section-header--compact .workspace-section-header__copy p {
  margin-top: 6px;
  font-size: 0.92rem;
  line-height: 1.6;
}

.workspace-section-header--compact .workspace-section-header__meta {
  min-height: 34px;
  padding: 0 12px;
  font-size: 0.8rem;
}

@media (max-width: 640px) {
  .workspace-section-header__actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
