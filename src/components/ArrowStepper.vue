<script setup lang="ts">
defineProps<{
  label: string
  /** Accessible name of the thing being stepped, e.g. "inversion". */
  what: string
  canPrevious: boolean
  canNext: boolean
}>()

defineEmits<{ step: [direction: -1 | 1] }>()
</script>

<template>
  <div class="stepper">
    <button
      type="button"
      class="arrow"
      :aria-label="`Previous ${what}`"
      :disabled="!canPrevious"
      @click="$emit('step', -1)"
    >
      ◀
    </button>
    <span>{{ label }}</span>
    <button
      type="button"
      class="arrow"
      :aria-label="`Next ${what}`"
      :disabled="!canNext"
      @click="$emit('step', 1)"
    >
      ▶
    </button>
  </div>
</template>

<style scoped>
.stepper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.9rem;
  color: var(--muted);
}

.arrow {
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
}

.arrow:disabled {
  opacity: 0.3;
  cursor: default;
}
</style>
