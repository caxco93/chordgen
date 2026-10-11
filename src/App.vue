<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import ArrowStepper from './components/ArrowStepper.vue'
import ChordSelect from './components/ChordSelect.vue'
import MultiSelect from './components/MultiSelect.vue'
import PianoKeyboard from './components/PianoKeyboard.vue'
import { usePlayback } from './usePlayback'
import {
  DEFAULT_KEY_GROUPS,
  INVERSION_LABELS,
  KEY_GROUPS,
  buildProgression,
  chordOptions,
  invert,
  keyboardStart,
  type Progression,
  rerollProgression,
} from './chords'

const keyGroups = ref([...DEFAULT_KEY_GROUPS])
const progression = ref(buildProgression(0))

const DEFAULT_OCTAVE = 4
const CHORD_COUNT = 4
// Each chord's diagram, inversion and octave are set independently.
const inversions = ref<number[]>(Array(CHORD_COUNT).fill(0))
const octaves = ref<number[]>(Array(CHORD_COUNT).fill(DEFAULT_OCTAVE))

// The full piano: A0 to C8.
const PIANO_LOW = 21
const PIANO_HIGH = 108
const DIAGRAM_SEMITONES = 24
const PREVIEW_MS = 2000

/** MIDI number of the C that chord notes are measured from, in scientific pitch notation (C4 = 60). */
function octaveBase(octave: number): number {
  return 12 * (octave + 1)
}

const voicings = computed(() =>
  progression.value.chords.map((chord, i) =>
    invert(chord.notes, inversions.value[i]!).map((note) => octaveBase(octaves.value[i]!) + note),
  ),
)

/** Whether the chord at `index` voiced this way stays within the piano's keys. */
function fits(index: number, octave: number, inversion: number): boolean {
  const notes = invert(progression.value.chords[index]!.notes, inversion).map((note) => octaveBase(octave) + note)
  return notes[0]! >= PIANO_LOW && notes[notes.length - 1]! <= PIANO_HIGH
}

/** The inversion and octave one step up or down from the current voicing, or undefined past the piano's ends. */
function inversionTarget(index: number, step: number): { inversion: number; octave: number } | undefined {
  const count = INVERSION_LABELS.length
  const next = inversions.value[index]! + step
  const inversion = (next + count) % count
  const octave = octaves.value[index]! + Math.floor(next / count)
  return fits(index, octave, inversion) ? { inversion, octave } : undefined
}

const { bpm, loop, sound, currentIndex, isPlaying, toggle, stop, MIN_BPM, MAX_BPM } =
  usePlayback(voicings)

// A brief, fading look at a chord on the full piano. Each trigger restarts it.
const previewNotes = ref<number[]>([])
const previewId = ref(0)
let previewTimer: ReturnType<typeof setTimeout> | undefined

function showPreview(index: number) {
  previewNotes.value = voicings.value[index]!
  previewId.value++
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => (previewNotes.value = []), PREVIEW_MS)
}

function clearPreview() {
  clearTimeout(previewTimer)
  previewNotes.value = []
}

onUnmounted(clearPreview)

/** Steps the voicing up or down, rolling over into the neighbouring octave past either end. */
function shiftInversion(index: number, step: number) {
  const target = inversionTarget(index, step)
  if (!target) return
  inversions.value[index] = target.inversion
  octaves.value[index] = target.octave
  showPreview(index)
}

function shiftOctave(index: number, step: number) {
  const octave = octaves.value[index]! + step
  if (!fits(index, octave, inversions.value[index]!)) return
  octaves.value[index] = octave
  showPreview(index)
}

function togglePlayback() {
  clearPreview()
  toggle()
}

function setProgression(next: Progression) {
  stop()
  clearPreview()
  inversions.value.fill(0)
  octaves.value.fill(DEFAULT_OCTAVE)
  progression.value = next
}

function reroll() {
  setProgression(rerollProgression(progression.value.root, keyGroups.value))
}

function selectKey(root: number) {
  if (root !== progression.value.root) setProgression(buildProgression(root))
}
</script>

<template>
  <main>
    <ul class="chords">
      <li
        v-for="(chord, i) in progression.chords"
        :key="chord.numeral"
        class="chord"
        :class="{ playing: currentIndex === i }"
        @mouseenter="showPreview(i)"
      >
        <div class="chord-header">
          <ChordSelect
            :name="chord.name"
            :options="chordOptions(i)"
            :selected="progression.root"
            @select="selectKey"
          />
          <span class="numeral">{{ chord.numeral }}</span>
        </div>
        <div class="detail">
          <PianoKeyboard
            class="detail-piano"
            :notes="voicings[i]!"
            :low="octaveBase(octaves[i]!) + keyboardStart(chord.notes)"
            :high="octaveBase(octaves[i]!) + keyboardStart(chord.notes) + DIAGRAM_SEMITONES - 1"
          />
          <div class="steppers">
            <ArrowStepper
              what="inversion"
              :label="INVERSION_LABELS[inversions[i]!]!"
              :can-previous="!!inversionTarget(i, -1)"
              :can-next="!!inversionTarget(i, 1)"
              @step="shiftInversion(i, $event)"
            />
            <ArrowStepper
              what="octave"
              :label="`Octave ${octaves[i]}`"
              :can-previous="fits(i, octaves[i]! - 1, inversions[i]!)"
              :can-next="fits(i, octaves[i]! + 1, inversions[i]!)"
              subtle
              @step="shiftOctave(i, $event)"
            />
          </div>
        </div>
      </li>
    </ul>
    <footer>
      <button type="button" @click="reroll">Reroll I-V-vi-IV</button>
      <MultiSelect v-model="keyGroups" label="Keys for I" :options="KEY_GROUPS" />
      <button type="button" @click="togglePlayback">{{ isPlaying ? 'Stop' : 'Play' }}</button>
      <label>
        <input v-model="loop" type="checkbox" />
        Loop
      </label>
      <label>
        <input v-model="sound" type="checkbox" />
        Sound
      </label>
      <label>
        <input v-model.number="bpm" type="number" class="bpm" :min="MIN_BPM" :max="MAX_BPM" />
        BPM
      </label>
    </footer>
    <PianoKeyboard
      class="full-piano"
      :notes="currentIndex === null ? previewNotes : voicings[currentIndex]!"
      :low="PIANO_LOW"
      :high="PIANO_HIGH"
      :fade-ms="currentIndex === null ? PREVIEW_MS : undefined"
      :fade-key="previewId"
    />
  </main>
</template>

<style scoped>
main {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  box-sizing: border-box;
  overflow: hidden;
}

.chords {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 1rem;
}

.chord {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-height: 0;
  padding: 1rem;
  border-radius: 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
}

.chord.playing {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent);
}

.chord-header {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
}

.detail {
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  max-width: 32rem;
}

.detail-piano {
  min-height: 0;
}

/*
 * Grid columns (previous arrow / label / next arrow) are sized across both rows at once,
 * so the Inversion and Octave arrows land in the same column. The label column's min-width
 * is set in `ch` to fit the longest label that can ever appear ("Root position" / "1st
 * inversion" / "2nd inversion", all 13 characters; "Octave N" is shorter) rather than sizing
 * to 1fr or to the current chord's own labels. A 1fr track pushes the next-arrow to the far
 * edge of the card instead of right after the label, and sizing per-chord content would make
 * the arrows jump around as the chord progression rerolls. The fixed `ch` width keeps the
 * arrows sitting right next to the label and stable across every chord.
 */
.steppers {
  display: grid;
  grid-template-columns: auto minmax(13ch, auto) auto;
  justify-content: center;
  align-items: center;
  column-gap: 0.5rem;
  row-gap: 0.35rem;
  width: 100%;
}

.full-piano {
  flex: none;
}

.bpm {
  width: 4rem;
  padding: 0.3rem 0.4rem;
  font: inherit;
  color: inherit;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}

.numeral {
  font-size: 1.5rem;
  color: var(--muted);
}

footer {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
  font-size: 0.9rem;
}
</style>
