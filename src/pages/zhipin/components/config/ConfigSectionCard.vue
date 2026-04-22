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
  <section class="config-section-card" :class="{ 'config-section-card--compact': compact }">
    <header class="config-section-card__header" :class="{ 'config-section-card__header--split': $slots.actions }">
      <div class="config-section-card__copy">
        <span v-if="eyebrow" class="config-section-card__eyebrow">{{ eyebrow }}</span>
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
  position: relative;
  overflow: hidden;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid rgb(148 163 184 / 18%);
  background:
    radial-gradient(circle at top right, rgb(56 189 248 / 10%), transparent 30%),
    radial-gradient(circle at left bottom, rgb(251 191 36 / 12%), transparent 36%),
    linear-gradient(165deg, rgb(255 255 255 / 86%), rgb(248 250 252 / 94%));
  box-shadow:
    0 18px 36px rgb(15 23 42 / 8%),
    inset 0 1px 0 rgb(255 255 255 / 64%);
  backdrop-filter: blur(16px);
}

.config-section-card--compact {
  padding: 18px;
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgb(14 165 233 / 8%), transparent 28%),
    linear-gradient(165deg, rgb(255 255 255 / 92%), rgb(248 250 252 / 98%));
  box-shadow:
    0 14px 28px rgb(15 23 42 / 6%),
    inset 0 1px 0 rgb(255 255 255 / 72%);
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
  display: inline-flex;
  margin-bottom: 10px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #0f766e;
}

.config-section-card__copy h3 {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.2;
  color: #0f172a;
}

.config-section-card__copy p {
  margin: 10px 0 0;
  color: #64748b;
  line-height: 1.7;
}

.config-section-card__body {
  min-width: 0;
}

.config-section-card__footer {
  margin-top: 18px;
}

:global(html.dark) .config-section-card {
  border-color: rgb(71 85 105 / 42%);
  background:
    radial-gradient(circle at top right, rgb(6 182 212 / 12%), transparent 30%),
    radial-gradient(circle at left bottom, rgb(56 189 248 / 12%), transparent 34%),
    linear-gradient(165deg, rgb(15 23 42 / 90%), rgb(30 41 59 / 92%));
  box-shadow:
    0 18px 36px rgb(2 6 23 / 24%),
    inset 0 1px 0 rgb(255 255 255 / 6%);
}

:global(html.dark) .config-section-card--compact {
  background:
    radial-gradient(circle at top right, rgb(14 165 233 / 10%), transparent 28%),
    linear-gradient(165deg, rgb(15 23 42 / 78%), rgb(30 41 59 / 84%));
  box-shadow:
    0 14px 28px rgb(2 6 23 / 20%),
    inset 0 1px 0 rgb(255 255 255 / 5%);
}

:global(html.dark) .config-section-card__eyebrow {
  color: #67e8f9;
}

:global(html.dark) .config-section-card__copy h3 {
  color: #e2e8f0;
}

:global(html.dark) .config-section-card__copy p {
  color: #94a3b8;
}

@media (max-width: 640px) {
  .config-section-card,
  .config-section-card--compact {
    padding: 18px;
    border-radius: 20px;
  }
}
</style>
