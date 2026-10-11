<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import ArrowStepper from './components/ArrowStepper.vue'
import ChordSelect from './components/ChordSelect.vue'
import MultiSelect from './components/MultiSelect.vue'
import PianoKeyboard from './components/PianoKeyboard.vue'
import ProgressionControl from './components/ProgressionControl.vue'
import { INSTRUMENTS } from './audio'
import { useMidiInput } from './useMidiInput'
import { usePressedKeys } from './usePressedKeys'
import { usePlayback } from './usePlayback'
import {
  DEFAULT_KEY_GROUPS,
  DEFAULT_STEPS,
  INVERSION_LABELS,
  KEY_GROUPS,
  PIANO_HIGH,
  PIANO_LOW,
  buildProgression,
  chordOptions,
  fitsPiano,
  invert,
  keyboardStart,
  noteName,
  octaveBase,
  parseNumerals,
  type Progression,
  type Step,
  rerollProgression,
} from './chords'
import { optimizeInversions } from './optimizeInversions'
import { track } from './analytics'

/** A list with `value` for each chord of the current progression. */
function perChord(value: number): number[] {
  return Array(steps.value.length).fill(value)
}

const keyGroups = ref([...DEFAULT_KEY_GROUPS])
const steps = ref<Step[]>(DEFAULT_STEPS)
const progression = ref(buildProgression(0, steps.value))
// Chords picked from different keys no longer form the progression.
const isMixed = computed(() => chordRoots.value.some((root) => root !== chordRoots.value[0]))
const numerals = computed(() => steps.value.map((step) => step.numeral).join('-'))

const DEFAULT_OCTAVE = 4
// Each chord's diagram, inversion and octave are set independently.
const inversions = ref<number[]>(perChord(0))
const octaves = ref<number[]>(perChord(DEFAULT_OCTAVE))
// The key each chord was picked from. They all match while the progression is locked.
const chordRoots = ref<number[]>(perChord(progression.value.root))
// While locked, picking a chord moves the whole progression to that chord's key.
const locked = ref(true)

const DIAGRAM_SEMITONES = 24
const PREVIEW_MS = 2000
const SEQUENCE_STEP_MS = 250

const voicings = computed(() =>
  progression.value.chords.map((chord, i) =>
    invert(chord.notes, inversions.value[i]!).map((note) => octaveBase(octaves.value[i]!) + note),
  ),
)

/** Whether the chord at `index` voiced this way stays within the piano's keys. */
function fits(index: number, octave: number, inversion: number): boolean {
  return fitsPiano(progression.value.chords[index]!.notes, octave, inversion)
}

/** The inversion and octave one step up or down from the current voicing, or undefined past the piano's ends. */
function inversionTarget(index: number, step: number): { inversion: number; octave: number } | undefined {
  const count = INVERSION_LABELS.length
  const next = inversions.value[index]! + step
  const inversion = (next + count) % count
  const octave = octaves.value[index]! + Math.floor(next / count)
  return fits(index, octave, inversion) ? { inversion, octave } : undefined
}

const { bpm, loop, sound, instrument, currentIndex, isPlaying, toggle, stop, MIN_BPM, MAX_BPM } =
  usePlayback(voicings)

// Mouse clicks have no velocity, so they play at a fixed, moderately loud one.
const CLICK_VELOCITY = 0.8

const midi = ref(false)
const keys = usePressedKeys(instrument)
const { pressed } = keys
useMidiInput(keys, midi)

// A brief, fading look at a chord on the full piano. Each trigger restarts it.
const previewNotes = ref<number[]>([])
const previewId = ref(0)
let previewTimer: ReturnType<typeof setTimeout> | undefined
let sequenceTimers: ReturnType<typeof setTimeout>[] = []

function showPreview(index: number) {
  showNotes(voicings.value[index]!)
}

function showNotes(notes: number[]) {
  previewNotes.value = notes
  previewId.value++
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => (previewNotes.value = []), PREVIEW_MS)
}

/** Previews every chord one after the other, left to right. */
function showSequence() {
  clearPreview()
  voicings.value.forEach((notes, i) => {
    sequenceTimers.push(setTimeout(() => showNotes(notes), i * SEQUENCE_STEP_MS))
  })
}

function clearPreview() {
  sequenceTimers.forEach(clearTimeout)
  sequenceTimers = []
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

/** Moves every chord one octave up or down together, unless any of them would leave the piano. */
function shiftAllOctaves(step: number) {
  if (!canShiftAllOctaves(step)) return
  octaves.value = octaves.value.map((octave) => octave + step)
  showNotes(voicings.value.flat())
}

function canShiftAllOctaves(step: number): boolean {
  return octaves.value.every((octave, i) => fits(i, octave + step, inversions.value[i]!))
}

/**
 * Locks chord `index`'s current voicing and re-voices every other chord around it: as close to
 * it as possible while keeping the whole progression's span (lowest to highest note) as small as
 * possible. See `optimizeInversions` for the exact ordering of those two criteria.
 */
function optimizeInversionsFrom(index: number) {
  stop()
  const allNotes = progression.value.chords.map((chord) => chord.notes)
  const anchor = { inversion: inversions.value[index]!, octave: octaves.value[index]! }
  track('closest-inversions', {
    key: noteName(chordRoots.value[index]!, chordRoots.value[index]!),
    chord: progression.value.chords[index]!.name,
    octave: anchor.octave,
    inversion: anchor.inversion,
    progression: progression.value.chords.map((chord) => chord.name).join('-'),
    voicings: octaves.value.map((octave, i) => `${octave}/${inversions.value[i]}`).join('-'),
  })
  const result = optimizeInversions(allNotes, index, anchor)
  inversions.value = result.inversions
  octaves.value = result.octaves
  showSequence()
}

function togglePlayback() {
  track(isPlaying.value ? 'stop' : 'play', { bpm: bpm.value, instrument: instrument.value })
  clearPreview()
  toggle()
}

function setProgression(next: Progression) {
  stop()
  clearPreview()
  progression.value = next
  inversions.value = perChord(0)
  octaves.value = perChord(DEFAULT_OCTAVE)
  chordRoots.value = perChord(next.root)
}

function reroll() {
  track('reroll')
  setProgression(rerollProgression(progression.value.root, keyGroups.value, steps.value))
  showNotes(voicings.value.flat())
}

function selectProgression(text: string) {
  const next = parseNumerals(text)
  if (!next) return
  track('select-progression', { numerals: text.trim() })
  steps.value = next
  setProgression(buildProgression(progression.value.root, next))
}

function selectChord(index: number, root: number) {
  if (locked.value) {
    if (chordRoots.value.some((r) => r !== root)) setProgression(buildProgression(root, steps.value))
    return
  }
  if (root === chordRoots.value[index]) return
  stop()
  clearPreview()
  chordRoots.value[index] = root
  inversions.value[index] = 0
  if (!fits(index, octaves.value[index]!, 0)) octaves.value[index] = DEFAULT_OCTAVE
  progression.value = {
    ...progression.value,
    chords: progression.value.chords.map((chord, i) =>
      i === index ? buildProgression(root, steps.value).chords[index]! : chord,
    ),
  }
}
</script>

<template>
  <main>
    <a
      class="github-link"
      href="https://github.com/caxco93/chordgen"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="chordgen on GitHub"
      data-umami-event="github-click"
    >
      <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor" aria-hidden="true">
        <path
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
    </a>
    <header class="toolbar">
      <ProgressionControl v-model:locked="locked" :current="isMixed ? null : numerals" @select="selectProgression" />
      <ArrowStepper
        what="octave"
        label="Octave"
        :can-previous="canShiftAllOctaves(-1)"
        :can-next="canShiftAllOctaves(1)"
        @step="shiftAllOctaves"
      />
    </header>
    <ul class="chords">
      <li
        v-for="(chord, i) in progression.chords"
        :key="i"
        class="chord"
        :class="{ playing: currentIndex === i }"
        @mouseenter="showPreview(i)"
      >
        <div class="chord-header">
          <ChordSelect
            :name="chord.name"
            :options="chordOptions(steps, i)"
            :selected="chordRoots[i]!"
            @select="selectChord(i, $event)"
          />
          <span class="numeral" :class="{ hidden: isMixed }">{{ chord.numeral }}</span>
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
          <button type="button" class="optimize" @click="optimizeInversionsFrom(i)">Closest Inversions</button>
        </div>
      </li>
    </ul>
    <footer>
      <button type="button" @click="reroll">Reroll</button>
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
      <label>
        <select v-model="instrument" class="instrument">
          <option v-for="option in INSTRUMENTS" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
        Instrument
      </label>
      <label>
        <input v-model="midi" type="checkbox" />
        MIDI Instrument
      </label>
    </footer>
    <PianoKeyboard
      class="full-piano"
      :notes="currentIndex === null ? previewNotes : voicings[currentIndex]!"
      :low="PIANO_LOW"
      :high="PIANO_HIGH"
      :fade-ms="currentIndex === null ? PREVIEW_MS : undefined"
      :fade-key="previewId"
      :pressed="pressed"
      playable
      @press="keys.press($event, CLICK_VELOCITY)"
      @release="keys.release"
    />
  </main>
</template>

<style scoped>
main {
  position: relative;
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

/* Same look as the global button, just condensed to fit comfortably below the steppers. */
.optimize {
  font-size: 0.85rem;
  padding: 0.35rem 0.8rem;
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

.instrument {
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

/* Keeps its space so the layout doesn't shift. */
.numeral.hidden {
  visibility: hidden;
}

.github-link {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  color: var(--muted);
}

.github-link:hover {
  color: inherit;
}

.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
  font-size: 0.9rem;
}

footer {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
  font-size: 0.9rem;
}

@media (max-width: 40rem) {
  .chords {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* Two columns leave ~145px per card; tighten the card and let the stepper label track shrink so the arrows stay inside. */
  .chord {
    padding: 0.5rem;
  }

  .steppers {
    grid-template-columns: auto minmax(0, 1fr) auto;
    column-gap: 0.25rem;
  }
}
</style>
