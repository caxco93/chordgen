import { INVERSION_LABELS, fitsPiano, invert, octaveBase } from './chords'

export interface Voicing {
  inversion: number
  octave: number
}

export interface OptimizeResult {
  inversions: number[]
  octaves: number[]
}

/** Which quantity `optimizeInversions` prioritizes; see its doc comment for each mode's ordering. */
export type OptimizeMode = 'span' | 'keyChanges'

function voicingNotes(notes: number[], voicing: Voicing): number[] {
  return invert(notes, voicing.inversion).map((note) => octaveBase(voicing.octave) + note)
}

/**
 * Every (inversion, octave) pair for a chord's notes that keeps it within the piano's keys,
 * considering only octaves within one of `lockedOctave`. A chord re-voiced to sit close to the
 * locked chord is never more than an octave away from it anyway, so this keeps the combination
 * search below small (3 octaves × 3 inversions per chord) without ever discarding a voicing that
 * a sane result could actually use.
 */
function validVoicings(notes: number[], lockedOctave: number): Voicing[] {
  const choices: Voicing[] = []
  for (let octave = lockedOctave - 1; octave <= lockedOctave + 1; octave++) {
    for (let inversion = 0; inversion < INVERSION_LABELS.length; inversion++) {
      if (fitsPiano(notes, octave, inversion)) choices.push({ inversion, octave })
    }
  }
  return choices
}

/**
 * Sum of each locked note's distance to its nearest note in `notes`. A simple stand-in for how
 * close two voicings sit together that, unlike a straight centroid distance, still rewards a
 * voicing for sharing actual notes with the locked chord regardless of inversion.
 */
function closenessToLocked(notes: number[], lockedNotes: number[]): number {
  return lockedNotes.reduce((sum, lockedNote) => sum + Math.min(...notes.map((note) => Math.abs(note - lockedNote))), 0)
}

/** Lowest to highest MIDI note across every chord's voicing. */
function overallSpan(notesByIndex: number[][]): number {
  const flat = notesByIndex.flat()
  return Math.max(...flat) - Math.min(...flat)
}

/** Sum, over every chord but the locked one, of `closenessToLocked` against the locked chord. */
function closenessScore(notesByIndex: number[][], lockedIndex: number, lockedNotes: number[]): number {
  return notesByIndex.reduce((sum, notes, i) => (i === lockedIndex ? sum : sum + closenessToLocked(notes, lockedNotes)), 0)
}

/**
 * Sum, over each consecutive pair of chords in progression order, of how many physical piano keys
 * differ between them: keys released plus keys newly pressed (the symmetric difference of their
 * MIDI note sets). Minimizing this is the same as maximizing the keys held down across the whole
 * progression. The wrap-around pair (last chord back to the first) is deliberately left out —
 * whether that pair matters depends on whether playback loops, which this algorithm doesn't know
 * about, so the simplest choice is to only count the pairs that always play consecutively.
 */
function totalKeyChanges(notesByIndex: number[][]): number {
  let total = 0
  for (let i = 0; i < notesByIndex.length - 1; i++) {
    const here = new Set(notesByIndex[i])
    const next = new Set(notesByIndex[i + 1])
    for (const note of here) if (!next.has(note)) total++
    for (const note of next) if (!here.has(note)) total++
  }
  return total
}

/**
 * Each mode's score tuple for one candidate combination of voicings, compared lexicographically
 * (first element first) so earlier elements are the primary criterion and later ones only break
 * ties. `notesByIndex[i]` is the MIDI notes of chord `i`'s voicing, in progression order.
 *
 * - 'span': overall span, then closeness to the locked chord — the current approach, unchanged.
 * - 'keyChanges': total key changes between consecutive chords (see `totalKeyChanges`) first,
 *   then overall span, then closeness to the locked chord, as tiebreakers.
 */
const SCORERS: Record<OptimizeMode, (notesByIndex: number[][], lockedIndex: number, lockedNotes: number[]) => number[]> = {
  span: (notesByIndex, lockedIndex, lockedNotes) => [
    overallSpan(notesByIndex),
    closenessScore(notesByIndex, lockedIndex, lockedNotes),
  ],
  keyChanges: (notesByIndex, lockedIndex, lockedNotes) => [
    totalKeyChanges(notesByIndex),
    overallSpan(notesByIndex),
    closenessScore(notesByIndex, lockedIndex, lockedNotes),
  ],
}

/** Lexicographic comparison of two equal-length score tuples: negative when `a` is better. */
function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!
  }
  return 0
}

/**
 * Re-voices every chord other than `lockedIndex` to a combination of (inversion, octave) choices
 * that scores best under `mode` (see `SCORERS` for each mode's exact criteria and their order).
 *
 * Each other chord's valid (inversion, octave) pairs are enumerated independently — whatever
 * fits the piano, per `fitsPiano`, within one octave of the locked chord's own octave (see
 * `validVoicings`) — then every combination across all of them is scored by `mode`'s scorer and
 * the best one kept. The search space is tiny (3 octaves × 3 inversions per chord, few chords),
 * so a plain exhaustive search stays readable without needing a heuristic.
 */
export function optimizeInversions(
  allNotes: number[][],
  lockedIndex: number,
  lockedVoicing: Voicing,
  mode: OptimizeMode = 'span',
): OptimizeResult {
  const lockedNotes = voicingNotes(allNotes[lockedIndex]!, lockedVoicing)
  const otherIndices = allNotes.map((_, i) => i).filter((i) => i !== lockedIndex)
  const optionsPerChord = otherIndices.map((i) => validVoicings(allNotes[i]!, lockedVoicing.octave))
  const score = SCORERS[mode]

  let best: Voicing[] = []
  let bestScore: number[] | undefined

  // Depth-first search over every combination of choices, one per other chord.
  function search(depth: number, chosen: Voicing[]) {
    if (depth === otherIndices.length) {
      const notesByIndex: number[][] = []
      notesByIndex[lockedIndex] = lockedNotes
      otherIndices.forEach((i, k) => {
        notesByIndex[i] = voicingNotes(allNotes[i]!, chosen[k]!)
      })
      const candidateScore = score(notesByIndex, lockedIndex, lockedNotes)
      if (!bestScore || compareScores(candidateScore, bestScore) < 0) {
        bestScore = candidateScore
        best = [...chosen]
      }
      return
    }
    for (const voicing of optionsPerChord[depth]!) {
      chosen.push(voicing)
      search(depth + 1, chosen)
      chosen.pop()
    }
  }

  search(0, [])

  const inversions: number[] = []
  const octaves: number[] = []
  inversions[lockedIndex] = lockedVoicing.inversion
  octaves[lockedIndex] = lockedVoicing.octave
  otherIndices.forEach((i, k) => {
    inversions[i] = best[k]!.inversion
    octaves[i] = best[k]!.octave
  })

  return { inversions, octaves }
}
