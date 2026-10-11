const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Pitch classes of the C major scale, i.e. the natural notes.
const MAJOR_SCALE_ROOTS = [0, 2, 4, 5, 7, 9, 11]
const ALL_ROOTS = Array.from({ length: 12 }, (_, i) => i)

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
  /** Semitones above the lowest C of a two-octave keyboard, bottom to top, in root position. */
  notes: number[]
}

const MAJOR_TRIAD = [0, 4, 7]
const MINOR_TRIAD = [0, 3, 7]

/**
 * Where the keyboard diagram begins: C, or F for chords rooted on F-B, whose
 * inversions would otherwise run past the end of two octaves.
 */
export function keyboardStart(notes: number[]): number {
  return notes[0]! >= 5 ? 5 : 0
}

export const INVERSION_LABELS = ['Root position', '1st inversion', '2nd inversion']

/** Returns the chord's notes bottom to top in the given inversion (0-2), each lowest note moved up an octave. */
export function invert(notes: number[], inversion: number): number[] {
  return [...notes.slice(inversion), ...notes.slice(0, inversion).map((n) => n + 12)]
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
    notes: (minor ? MINOR_TRIAD : MAJOR_TRIAD).map((interval) => ((root + offset) % 12) + interval),
  }))
  return { root, chords }
}

/** Picks a random key for the progression, never the one in `previous`. */
export function rerollProgression(previous: number, majorScaleOnly: boolean): Progression {
  const roots = majorScaleOnly ? MAJOR_SCALE_ROOTS : ALL_ROOTS
  const candidates = roots.filter((r) => r !== previous)
  return buildProgression(candidates[Math.floor(Math.random() * candidates.length)]!)
}
