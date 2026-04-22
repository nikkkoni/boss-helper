<script lang="ts" setup>
import { ref } from 'vue'

const rootRef = ref<HTMLElement | null>(null)

function getRootElement() {
  return rootRef.value
}

defineExpose({
  getRootElement,
})
</script>

<template>
  <div ref="rootRef" class="helper-dashboard bh-workspace-stack">
    <section class="helper-dashboard__hero bh-workspace-stack">
      <div class="helper-dashboard__hero-block">
        <slot name="header" />
      </div>

      <div class="helper-dashboard__hero-block">
        <slot name="metrics" />
      </div>
    </section>

    <div class="helper-dashboard__body">
      <main class="helper-dashboard__main bh-workspace-section-gap">
        <slot name="main" />
      </main>

      <aside v-if="$slots.aside" class="helper-dashboard__aside">
        <div
          class="helper-dashboard__aside-inner bh-workspace-aside-sticky bh-workspace-section-gap"
        >
          <slot name="aside" />
        </div>
      </aside>
    </div>

    <slot />
  </div>
</template>

<style lang="scss">
.helper-dashboard {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: var(--bh-text-primary);
}

.helper-dashboard__hero {
  position: relative;
  display: grid;
  gap: 18px;
}

.helper-dashboard__hero-block {
  position: relative;
  z-index: 1;
}

.helper-dashboard__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
  gap: 20px;
  align-items: start;
}

.helper-dashboard__main,
.helper-dashboard__aside {
  min-width: 0;
}

.helper-dashboard__aside-inner {
  width: 100%;
}

@media (max-width: 1280px) {
  .helper-dashboard__body {
    grid-template-columns: 1fr;
  }

  .helper-dashboard__aside-inner {
    position: static;
  }
}
</style>
