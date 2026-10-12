<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDismiss } from './useDismiss';

const props = defineProps<{
  label: string;
  options: { id: string; label: string }[];
}>();

/** Ids of the selected options. At least one always stays selected. */
const selected = defineModel<string[]>({ required: true });

const open = ref(false);
const root = ref<HTMLElement | null>(null);
useDismiss(root, () => (open.value = false));

function summarize(ids: string[]): string {
  return props.options
    .filter((o) => ids.includes(o.id))
    .map((o) => o.label)
    .join(', ');
}

const summary = computed(() => summarize(selected.value));
// The summary with everything selected is the widest it can get.
const widestSummary = computed(() => summarize(props.options.map((o) => o.id)));

function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((s) => s !== id)
    : [...selected.value, id];
}
</script>

<template>
  <div ref="root" class="multi-select">
    <button type="button" aria-haspopup="listbox" :aria-expanded="open" @click="open = !open">
      <span class="summary">
        <span>{{ label }}: {{ summary }}</span>
        <span class="sizer" aria-hidden="true">{{ label }}: {{ widestSummary }}</span>
      </span>
      ▾
    </button>
    <ul v-if="open" class="options" role="listbox" aria-multiselectable="true">
      <li
        v-for="option in options"
        :key="option.id"
        role="option"
        :aria-selected="selected.includes(option.id)"
      >
        <label>
          <input
            type="checkbox"
            :checked="selected.includes(option.id)"
            :disabled="selected.length === 1 && selected.includes(option.id)"
            @change="toggle(option.id)"
          >
          {{ option.label }}
        </label>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.multi-select {
  position: relative;
}

.multi-select button {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

/* Both spans share one grid cell, so the button is always as wide as the widest summary. */
.summary {
  display: grid;
  text-align: left;
}

.summary > * {
  grid-area: 1 / 1;
}

.sizer {
  visibility: hidden;
}

.options {
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 10;
  margin: 0 0 0.25rem;
  padding: 0.35rem;
  list-style: none;
  min-width: 100%;
  white-space: nowrap;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.2);
}

.options label {
  padding: 0.3rem 0.5rem;
}
</style>
