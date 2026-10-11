<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** MIDI notes to mark, bottom to top. */
  notes: number[]
  /** Lowest MIDI note shown; must be a white key. */
  low: number
  /** Highest MIDI note shown; must be a white key. */
  high: number
  /** Fade the marked notes out over this many milliseconds. */
  fadeMs?: number
  /** Changing this restarts the fade. */
  fadeKey?: number
  /** MIDI notes to paint as held-down keys. */
  pressed?: number[]
}>()

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11])
const WHITE_HEIGHT = 4
const BLACK_WIDTH = 0.6
const BLACK_HEIGHT = 2.4

interface Key {
  midi: number
  black: boolean
  /** Horizontal center, in white-key widths. A black key sits on the edge between two white keys. */
  x: number
}

const keys = computed<Key[]>(() => {
  let whitesSoFar = 0
  return Array.from({ length: props.high - props.low + 1 }, (_, i) => {
    const midi = props.low + i
    if (WHITE_PITCH_CLASSES.has(midi % 12)) return { midi, black: false, x: whitesSoFar++ + 0.5 }
    return { midi, black: true, x: whitesSoFar }
  })
})

const whiteKeys = computed(() => keys.value.filter((key) => !key.black))
const blackKeys = computed(() => keys.value.filter((key) => key.black))

const dots = computed(() =>
  props.notes.flatMap((midi, i) => {
    const key = keys.value.find((k) => k.midi === midi)
    if (!key) return []
    return [{ order: i + 1, x: key.x, y: (key.black ? BLACK_HEIGHT : WHITE_HEIGHT) - 0.6 }]
  }),
)
</script>

<template>
  <svg
    :viewBox="`0 0 ${whiteKeys.length} ${WHITE_HEIGHT}`"
    class="piano"
    role="img"
    aria-label="Piano keys to press"
  >
    <rect
      v-for="key in whiteKeys"
      :key="key.midi"
      class="white"
      :class="{ pressed: pressed?.includes(key.midi) }"
      :x="key.x - 0.5"
      y="0"
      width="1"
      :height="WHITE_HEIGHT"
    />
    <rect
      v-for="key in blackKeys"
      :key="key.midi"
      class="black"
      :class="{ pressed: pressed?.includes(key.midi) }"
      :x="key.x - BLACK_WIDTH / 2"
      y="0"
      :width="BLACK_WIDTH"
      :height="BLACK_HEIGHT"
    />
    <g
      :key="fadeKey"
      :class="{ fading: fadeMs !== undefined }"
      :style="{ animationDuration: `${fadeMs}ms` }"
    >
      <circle v-for="dot in dots" :key="dot.order" class="dot" :cx="dot.x" :cy="dot.y" r="0.26" />
    </g>
  </svg>
</template>

<style scoped>
.piano {
  width: 100%;
}

.white {
  fill: #fff;
  stroke: #555;
  stroke-width: 0.03;
}

.black {
  fill: #222;
}

.white.pressed,
.black.pressed {
  fill: #e5322d;
}

.dot {
  fill: var(--accent);
  stroke: #fff;
  stroke-width: 0.04;
}

.fading {
  animation: fade-out linear forwards;
}

@keyframes fade-out {
  to {
    opacity: 0;
  }
}
</style>
