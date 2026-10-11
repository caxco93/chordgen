<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_CHORDS, PRESETS, parseNumerals } from '../chords'
import { useDismiss } from './useDismiss'

defineProps<{
  /** The current progression in relative numerals, e.g. "I-V-vi-IV". */
  current: string
}>()

const emit = defineEmits<{ select: [numerals: string] }>()

/** Whether choosing a chord changes the whole progression to match. */
const locked = defineModel<boolean>('locked', { required: true })

const open = ref(false)
const root = ref<HTMLElement | null>(null)
useDismiss(root, () => (open.value = false))

const custom = ref('')
const customInvalid = computed(() => custom.value.trim() !== '' && !parseNumerals(custom.value))

function choose(numerals: string) {
  open.value = false
  emit('select', numerals)
}

function submitCustom() {
  if (custom.value.trim() === '' || customInvalid.value) return
  choose(custom.value)
}
</script>

<template>
  <div ref="root" class="progression-control">
    <div class="group">
      <button
        type="button"
        class="lock"
        :aria-pressed="locked"
        :aria-label="locked ? 'Unlock progression' : 'Lock progression'"
        :title="locked ? 'Choosing a chord changes the others to match' : 'Chords can be chosen independently'"
        @click="locked = !locked"
      >
        <!--
          A padlock. Unlocking swings the shackle open 180 degrees about its left leg (a flip
          about x=12), so it ends up beside the body rather than over it.
        -->
        <svg viewBox="0 0 28 24" width="18" height="16" aria-hidden="true">
          <path class="shackle" :class="{ open: !locked }" d="M12 11V7a4 4 0 0 1 8 0v4" />
          <rect class="body" x="8" y="11" width="16" height="11" rx="2" />
        </svg>
      </button>
      <button type="button" class="current" aria-haspopup="listbox" :aria-expanded="open" @click="open = !open">
        {{ current }} ▾
      </button>
    </div>
    <div v-if="open" class="popup">
      <ul class="presets" role="listbox">
        <li v-for="numerals in PRESETS" :key="numerals" role="option" :aria-selected="numerals === current">
          <button type="button" :class="{ selected: numerals === current }" @click="choose(numerals)">
            {{ numerals }}
          </button>
        </li>
      </ul>
      <form class="custom" @submit.prevent="submitCustom">
        <input
          v-model="custom"
          type="text"
          placeholder="Custom, e.g. ii V I"
          aria-label="Custom progression in relative numerals"
          :aria-invalid="customInvalid"
          :title="`Up to ${MAX_CHORDS} numerals. Upper case is major, lower case minor; b or # lowers or raises a degree.`"
        />
        <button type="submit" :disabled="custom.trim() === '' || customInvalid">Use</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.progression-control {
  position: relative;
}

/* The lock and the progression read as one control, but are separate buttons. */
.group {
  display: flex;
}

.group button {
  border-radius: 0;
}

.lock {
  border-radius: 0.5rem 0 0 0.5rem !important;
  border-right-width: 0;
}

.lock svg {
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.lock .body {
  fill: currentColor;
}

.shackle {
  transform-box: view-box;
  transform-origin: 12px 0;
  transition: transform 0.2s;
}

.shackle.open {
  transform: scaleX(-1);
}

.lock[aria-pressed='true'] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 45%, black);
}

.current {
  border-radius: 0 0.5rem 0.5rem 0 !important;
}

.popup {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  margin-top: 0.25rem;
  padding: 0.25rem;
  display: grid;
  gap: 0.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.2);
}

.presets {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.25rem;
}

.presets button {
  width: 100%;
  white-space: nowrap;
  background: none;
  border-color: transparent;
}

.presets button:hover {
  background: var(--bg);
}

.presets button.selected {
  color: var(--accent);
  border-color: var(--accent);
}

.custom {
  display: flex;
  gap: 0.25rem;
}

.custom input {
  flex: 1;
  min-width: 0;
  padding: 0.3rem 0.5rem;
  font: inherit;
  color: inherit;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}

.custom input[aria-invalid='true'] {
  border-color: #d33;
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
