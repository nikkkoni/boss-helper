<script lang="ts" setup>
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
    <header class="config-section-card__header" :class="{ 'config-section-card__header--split': $slots.actions }">
      <div class="config-section-card__copy">
        <span v-if="eyebrow" class="config-section-card__eyebrow bh-eyebrow">{{ eyebrow }}</span>
        <h3>{{ title }}</h3>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="config-section-card__actions">
        <slot name="actions" />
      </div>
    </header>

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

.config-section-card__header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 18px;
}

.config-section-card__header--split {
  justify-content: space-between;
  align-items: flex-start;
}

.config-section-card__copy {
  min-width: 0;
}

.config-section-card__eyebrow {
  margin-bottom: 10px;
}

.config-section-card__copy h3 {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.2;
  color: var(--bh-text-primary);
}

.config-section-card__copy p {
  margin: 10px 0 0;
  color: var(--bh-text-muted);
  line-height: 1.7;
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
