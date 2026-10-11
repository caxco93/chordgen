<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDismiss } from './useDismiss'

const props = defineProps<{
  label: string
  options: { id: string; label: string }[]
}>()

/** Ids of the selected options. At least one always stays selected. */
const selected = defineModel<string[]>({ required: true })

const open = ref(false)
const root = ref<HTMLElement | null>(null)
useDismiss(root, () => (open.value = false))

const summary = computed(() =>
  props.options
    .filter((o) => selected.value.includes(o.id))
    .map((o) => o.label)
    .join(', '),
)

function toggle(id: string) {
  const next = selected.value.includes(id) ? selected.value.filter((s) => s !== id) : [...selected.value, id]
  if (next.length > 0) selected.value = next
}
</script>

<template>
  <div ref="root" class="multi-select">
    <button type="button" aria-haspopup="listbox" :aria-expanded="open" @click="open = !open">
      {{ label }}: {{ summary }} ▾
    </button>
    <ul v-if="open" class="options" role="listbox" aria-multiselectable="true">
      <li v-for="option in options" :key="option.id" role="option" :aria-selected="selected.includes(option.id)">
        <label>
          <input type="checkbox" :checked="selected.includes(option.id)" @change="toggle(option.id)" />
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
