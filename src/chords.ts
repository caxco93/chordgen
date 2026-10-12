const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export interface KeyGroup {
  id: string;
  label: string;
  /** Pitch classes of the keys in this group. */
  roots: number[];
}

export const KEY_GROUPS: KeyGroup[] = [
  { id: 'major', label: 'Major', roots: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'accidentals', label: 'Sharps / flats', roots: [1, 3, 6, 8, 10] },
];

export const DEFAULT_KEY_GROUPS = ['major'];

// Keys conventionally spelled with flats.
const FLAT_KEYS = new Set([1, 3, 5, 8, 10]);

/** One chord of a progression: where it sits above the key's root and whether it is minor. */
export interface Step {
  numeral: string;
  /** Semitones above the key's root. */
  offset: number;
  minor: boolean;
}

export const MAX_CHORDS = 8;

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NUMERAL_PATTERN = /^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)$/;

/**
 * Parses relative numerals such as "ii V I" or "I-bVII-IV" into steps. Upper case is a major
 * chord and lower case a minor one, on the degree of the major scale, optionally lowered (b)
 * or raised (#). Returns undefined if the text is empty, too long or has an unknown numeral.
 */
export function parseNumerals(text: string): Step[] | undefined {
  const tokens = text.split(/[\s,\-–]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > MAX_CHORDS) {
    return undefined;
  }
  const steps: Step[] = [];
  for (const token of tokens) {
    const match = NUMERAL_PATTERN.exec(token);
    if (!match) {
      return undefined;
    }
    const [, accidental, numeral] = match;
    const degree = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'].indexOf(numeral!.toLowerCase());
    const shift = accidental === '' ? 0 : 'b♭'.includes(accidental!) ? -1 : 1;
    steps.push({
      numeral: token.replace('♭', 'b').replace('♯', '#'),
      offset: (MAJOR_SCALE[degree]! + shift + 12) % 12,
      minor: numeral === numeral!.toLowerCase(),
    });
  }
  return steps;
}

/** Common progressions, in relative numerals. The first is the default. */
export const PRESETS = [
  'I-V-vi-IV',
  'I-vi-IV-V',
  'vi-IV-I-V',
  'IV-I-V-vi',
  'I-IV-V-I',
  'ii-V-I',
  'vi-V-IV-iii',
  'i-bVI-bIII-bVII',
];

export const DEFAULT_STEPS = parseNumerals(PRESETS[0]!)!;

export interface Chord {
  numeral: string;
  name: string;
  /**
   * Semitones above the key's octave C, bottom to top, in root position. Roots are not
   * wrapped into one octave, so chords above the key's root (e.g. V in B) sit in the next octave.
   */
  notes: number[];
}

const MAJOR_TRIAD = [0, 4, 7];
const MINOR_TRIAD = [0, 3, 7];

/**
 * Where the keyboard diagram begins: the C or F (whichever is nearer below) at or
 * under the chord's root, so its inversions stay within two octaves.
 */
export function keyboardStart(notes: number[]): number {
  const root = notes[0]!;
  return Math.floor(root / 12) * 12 + (root % 12 >= 5 ? 5 : 0);
}

export const INVERSION_LABELS = ['Root position', '1st inversion', '2nd inversion'];

/** Returns the chord's notes bottom to top in the given inversion (0-2), each lowest note moved up an octave. */
export function invert(notes: number[], inversion: number): number[] {
  return [...notes.slice(inversion), ...notes.slice(0, inversion).map((n) => n + 12)];
}

// The full piano: A0 to C8.
export const PIANO_LOW = 21;
export const PIANO_HIGH = 108;

/** MIDI number of the C that chord notes are measured from, in scientific pitch notation (C4 = 60). */
export function octaveBase(octave: number): number {
  return 12 * (octave + 1);
}

/** Whether a chord's notes, inverted and placed in the given octave, stay within the piano's keys. */
export function fitsPiano(notes: number[], octave: number, inversion: number): boolean {
  const voiced = invert(notes, inversion).map((note) => octaveBase(octave) + note);
  return voiced[0]! >= PIANO_LOW && voiced[voiced.length - 1]! <= PIANO_HIGH;
}

export interface Progression {
  root: number;
  chords: Chord[];
}

/** The note name of a pitch class (0-11) in the spelling used by the progression key `root`. */
export function noteName(pitchClass: number, root: number): string {
  return (FLAT_KEYS.has(root) ? FLAT_NAMES : SHARP_NAMES)[pitchClass % 12]!;
}

export function buildProgression(root: number, steps: Step[]): Progression {
  const chords = steps.map(({ numeral, offset, minor }) => ({
    numeral,
    name: noteName(root + offset, root) + (minor ? 'm' : ''),
    notes: (minor ? MINOR_TRIAD : MAJOR_TRIAD).map((interval) => root + offset + interval),
  }));
  return { root, chords };
}

export interface ChordOption {
  /** The progression key that makes the chord this one. */
  root: number;
  name: string;
}

/** Every chord the chord at `index` can be, each paired with the progression key that produces it. */
export function chordOptions(steps: Step[], index: number): ChordOption[] {
  return Array.from({ length: 12 }, (_, root) => ({
    root,
    name: buildProgression(root, steps).chords[index]!.name,
  })).sort((a, b) => a.name.localeCompare(b.name) || a.root - b.root);
}

/** Picks a random key from the given groups for the progression, never the one in `previous`. */
export function rerollProgression(
  previous: number,
  groupIds: string[],
  steps: Step[],
): Progression {
  const roots = KEY_GROUPS.filter((g) => groupIds.includes(g.id)).flatMap((g) => g.roots);
  const candidates = roots.filter((r) => r !== previous);
  return buildProgression(candidates[Math.floor(Math.random() * candidates.length)]!, steps);
}
