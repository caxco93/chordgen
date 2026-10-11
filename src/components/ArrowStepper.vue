<script setup lang="ts">
defineProps<{
  label: string
  /** Accessible name of the thing being stepped, e.g. "inversion". */
  what: string
  canPrevious: boolean
  canNext: boolean
  /** De-emphasizes the stepper: bare arrow glyphs, lower contrast. Used for the Octave stepper. */
  subtle?: boolean
}>()

defineEmits<{ step: [direction: -1 | 1] }>()
</script>

<template>
  <!--
    display: contents below drops this div's own box, so its three children become direct
    items of the parent `.steppers` grid in App.vue and share its column tracks. That's what
    lines the Inversion and Octave arrows up in the same column across both rows.
  -->
  <div class="stepper" :class="{ subtle }">
    <button
      type="button"
      class="arrow"
      :aria-label="`Previous ${what}`"
      :disabled="!canPrevious"
      @click="$emit('step', -1)"
    >
      ◀
    </button>
    <span class="label">{{ label }}</span>
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
  display: contents;
}

.arrow {
  padding: 0.3rem 0.6rem;
  font-size: 0.7rem;
  color: inherit;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  cursor: pointer;
}

.arrow:hover:not(:disabled) {
  border-color: var(--muted);
}

.arrow:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.arrow:disabled {
  opacity: 0.3;
  cursor: default;
}

.label {
  font-size: 0.9rem;
  color: var(--muted);
  text-align: center;
}

/* Octave: de-emphasized relative to Inversion — bare glyphs, no border/fill, dimmer overall. */
.stepper.subtle .arrow {
  background: none;
  border-color: transparent;
  padding: 0.5rem 0.7rem;
  opacity: 0.6;
}

.stepper.subtle .arrow:hover:not(:disabled) {
  opacity: 1;
  color: var(--text);
}

.stepper.subtle .arrow:disabled {
  opacity: 0.2;
}

.stepper.subtle .label {
  opacity: 0.6;
}
</style>
