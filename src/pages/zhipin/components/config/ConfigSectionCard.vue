<script lang="ts" setup>
import { computed, ref } from 'vue'

import WorkspaceSectionHeader from '../workspace/WorkspaceSectionHeader.vue'

let cardId = 0

const props = withDefaults(defineProps<{
  eyebrow?: string
  title: string
  description?: string
  compact?: boolean
  collapsible?: boolean
  defaultCollapsed?: boolean
}>(), {
  eyebrow: '',
  description: '',
  compact: false,
  collapsible: false,
  defaultCollapsed: false,
})

const bodyId = `config-section-card-body-${++cardId}`
const isCollapsed = ref(props.collapsible && props.defaultCollapsed)
const isExpanded = computed(() => !props.collapsible || !isCollapsed.value)
const toggleLabel = computed(() => `${isExpanded.value ? '收起' : '展开'}${props.title}`)

function toggleCard() {
  if (!props.collapsible) {
    return
  }

  isCollapsed.value = !isCollapsed.value
}

function toggleCardWithKeyboard(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  event.preventDefault()
  toggleCard()
}
</script>

<template>
  <section
    class="config-section-card bh-glass-surface"
    :class="{
      'config-section-card--compact': compact,
      'config-section-card--collapsible': collapsible,
      'config-section-card--collapsed': collapsible && isCollapsed,
      'bh-glass-surface--soft': compact,
      'bh-glass-surface--card': !compact,
    }"
  >
    <div
      class="config-section-card__header"
      :class="{ 'config-section-card__header--clickable': collapsible }"
      :role="collapsible ? 'button' : undefined"
      :tabindex="collapsible ? 0 : undefined"
      :aria-controls="collapsible ? bodyId : undefined"
      :aria-expanded="collapsible ? isExpanded : undefined"
      :aria-label="collapsible ? toggleLabel : undefined"
      :title="collapsible ? toggleLabel : undefined"
      @click="toggleCard"
      @keydown="toggleCardWithKeyboard"
    >
      <WorkspaceSectionHeader
        :eyebrow="eyebrow"
        :title="title"
        :description="description"
        :size="compact ? 'compact' : 'section'"
      >
        <template v-if="$slots.actions || collapsible" #actions>
          <slot name="actions" />
          <span
            v-if="collapsible"
            class="config-section-card__toggle-icon bh-glass-pill"
            :class="{ 'config-section-card__toggle-icon--expanded': isExpanded }"
            aria-hidden="true"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path
                fill="currentColor"
                d="M5.24 7.24a.75.75 0 0 1 1.06 0L10 10.94l3.7-3.7a.75.75 0 1 1 1.06 1.06l-4.23 4.23a.75.75 0 0 1-1.06 0L5.24 8.3a.75.75 0 0 1 0-1.06Z"
              />
            </svg>
          </span>
        </template>
      </WorkspaceSectionHeader>
    </div>

    <div v-show="isExpanded" :id="bodyId" class="config-section-card__body">
      <slot />
    </div>

    <footer v-if="$slots.footer" v-show="isExpanded" class="config-section-card__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style lang="scss" scoped>
.config-section-card {
  padding: 22px;
  transition:
    border-color var(--bh-transition-base),
    box-shadow var(--bh-transition-base);
}

.config-section-card--compact {
  padding: 18px;
  border-radius: var(--bh-radius-card);
}

.config-section-card--collapsible {
  cursor: default;
}

.config-section-card--collapsed {
  box-shadow: var(--bh-shadow-collapsed);
}

.config-section-card__header--clickable {
  cursor: pointer;
  border-radius: calc(var(--bh-radius-card) - 8px);
}

.config-section-card__header--clickable:focus-visible {
  outline: 2px solid var(--bh-focus-ring);
  outline-offset: 6px;
}

.config-section-card--collapsed :deep(.workspace-section-header) {
  margin-bottom: 0;
}

.config-section-card__toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  color: var(--bh-text-secondary);
  pointer-events: none;
}

.config-section-card__toggle-icon svg {
  width: 18px;
  height: 18px;
  transition: transform var(--bh-transition-base);
}

.config-section-card__toggle-icon--expanded svg {
  transform: rotate(180deg);
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
