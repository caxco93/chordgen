const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

export interface KeyGroup {
  id: string
  label: string
  /** Pitch classes of the keys in this group. */
  roots: number[]
}

export const KEY_GROUPS: KeyGroup[] = [
  { id: 'major', label: 'Major', roots: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'accidentals', label: 'Sharps / flats', roots: [1, 3, 6, 8, 10] },
]

export const DEFAULT_KEY_GROUPS = ['major']

// Keys conventionally spelled with flats.
const FLAT_KEYS = new Set([1, 3, 5, 8, 10])

// I-V-vi-IV as [semitones above the key root, is minor].
const PROGRESSION: [number, boolean][] = [
  [0, false],
  [7, false],
  [9, true],
  [5, false],
]

export interface Chord {
  numeral: string
  name: string
  /**
   * Semitones above the key's octave C, bottom to top, in root position. Roots are not
   * wrapped into one octave, so chords above the key's root (e.g. V in B) sit in the next octave.
   */
  notes: number[]
}

const MAJOR_TRIAD = [0, 4, 7]
const MINOR_TRIAD = [0, 3, 7]

/**
 * Where the keyboard diagram begins: the C or F (whichever is nearer below) at or
 * under the chord's root, so its inversions stay within two octaves.
 */
export function keyboardStart(notes: number[]): number {
  const root = notes[0]!
  return Math.floor(root / 12) * 12 + (root % 12 >= 5 ? 5 : 0)
}

export const INVERSION_LABELS = ['Root position', '1st inversion', '2nd inversion']

/** Returns the chord's notes bottom to top in the given inversion (0-2), each lowest note moved up an octave. */
export function invert(notes: number[], inversion: number): number[] {
  return [...notes.slice(inversion), ...notes.slice(0, inversion).map((n) => n + 12)]
}

// The full piano: A0 to C8.
export const PIANO_LOW = 21
export const PIANO_HIGH = 108

/** MIDI number of the C that chord notes are measured from, in scientific pitch notation (C4 = 60). */
export function octaveBase(octave: number): number {
  return 12 * (octave + 1)
}

/** Whether a chord's notes, inverted and placed in the given octave, stay within the piano's keys. */
export function fitsPiano(notes: number[], octave: number, inversion: number): boolean {
  const voiced = invert(notes, inversion).map((note) => octaveBase(octave) + note)
  return voiced[0]! >= PIANO_LOW && voiced[voiced.length - 1]! <= PIANO_HIGH
}

export interface Progression {
  root: number
  chords: Chord[]
}

const NUMERALS = ['I', 'V', 'vi', 'IV']

export function buildProgression(root: number): Progression {
  const names = FLAT_KEYS.has(root) ? FLAT_NAMES : SHARP_NAMES
  const chords = PROGRESSION.map(([offset, minor], i) => ({
    numeral: NUMERALS[i]!,
    name: names[(root + offset) % 12]! + (minor ? 'm' : ''),
    notes: (minor ? MINOR_TRIAD : MAJOR_TRIAD).map((interval) => root + offset + interval),
  }))
  return { root, chords }
}

export interface ChordOption {
  /** The progression key that makes the chord this one. */
  root: number
  name: string
}

/** Every chord the chord at `index` can be, each paired with the progression key that produces it. */
export function chordOptions(index: number): ChordOption[] {
  return Array.from({ length: 12 }, (_, root) => ({
    root,
    name: buildProgression(root).chords[index]!.name,
  })).sort((a, b) => a.name.localeCompare(b.name) || a.root - b.root)
}

/** Picks a random key from the given groups for the progression, never the one in `previous`. */
export function rerollProgression(previous: number, groupIds: string[]): Progression {
  const roots = KEY_GROUPS.filter((g) => groupIds.includes(g.id)).flatMap((g) => g.roots)
  const candidates = roots.filter((r) => r !== previous)
  return buildProgression(candidates[Math.floor(Math.random() * candidates.length)]!)
}
