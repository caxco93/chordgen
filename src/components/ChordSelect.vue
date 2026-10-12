<script setup lang="ts">
import { ref } from 'vue';
import type { ChordOption } from '../chords';
import { useDismiss } from './useDismiss';

defineProps<{
  name: string;
  options: ChordOption[];
  /** The progression key currently selected. */
  selected: number;
}>();

const emit = defineEmits<{ select: [root: number] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
useDismiss(root, () => (open.value = false));

function choose(option: ChordOption) {
  open.value = false;
  emit('select', option.root);
}
</script>

<template>
  <div ref="root" class="chord-select">
    <button
      type="button"
      class="name"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ name }}
    </button>
    <ul v-if="open" class="options" role="listbox">
      <li
        v-for="option in options"
        :key="option.root"
        role="option"
        :aria-selected="option.root === selected"
      >
        <button
          type="button"
          :class="{ selected: option.root === selected }"
          @click="choose(option)"
        >
          {{ option.name }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.chord-select {
  position: relative;
}

.name {
  padding: 0;
  font-size: clamp(3rem, 12vw, 8rem);
  font-weight: 700;
  line-height: 1;
  background: none;
  border: none;
}

.options {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  margin: 0.25rem 0 0;
  padding: 0.25rem;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.2);
}

.options button {
  width: 100%;
  padding: 0.4rem 0.75rem;
  font-size: 1.1rem;
  background: none;
  border-color: transparent;
}

.options button:hover {
  background: var(--bg);
}

.options button.selected {
  color: var(--accent);
  border-color: var(--accent);
}
</style>
