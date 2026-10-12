import { fitsPiano, INVERSION_LABELS, invert, octaveBase } from './chords'

export interface Voicing {
  inversion: number
  octave: number
}

export interface OptimizeResult {
  inversions: number[]
  octaves: number[]
}

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
  return lockedNotes.reduce(
    (sum, lockedNote) => sum + Math.min(...notes.map((note) => Math.abs(note - lockedNote))),
    0,
  )
}

/**
 * Re-voices every chord other than `lockedIndex` to sit as close as possible to it, while
 * minimizing the overall span (lowest to highest MIDI note) across every chord's voicing.
 *
 * The two criteria are applied in this order:
 *   1. Overall span (primary) — the combination of choices with the smallest lowest-to-highest
 *      spread across all chords wins, so the whole progression sits in one comfortable range.
 *   2. Closeness to the locked chord (secondary) — among combinations tied on span, the one
 *      whose other chords sit nearest the locked chord's notes wins, for smooth voice leading.
 *
 * Each other chord's valid (inversion, octave) pairs are enumerated independently — whatever
 * fits the piano, per `fitsPiano`, within one octave of the locked chord's own octave (see
 * `validVoicings`) — then every combination across all of them is scored and the best one kept.
 * The search space is tiny (3 octaves × 3 inversions per chord, few chords), so a plain
 * exhaustive search stays readable without needing a heuristic.
 */
export function optimizeInversions(
  allNotes: number[][],
  lockedIndex: number,
  lockedVoicing: Voicing,
): OptimizeResult {
  const lockedNotes = voicingNotes(allNotes[lockedIndex]!, lockedVoicing)
  const otherIndices = allNotes.map((_, i) => i).filter((i) => i !== lockedIndex)
  const optionsPerChord = otherIndices.map((i) => validVoicings(allNotes[i]!, lockedVoicing.octave))

  let best: Voicing[] = []
  let bestSpan = Infinity
  let bestCloseness = Infinity

  // Depth-first search over every combination of choices, one per other chord.
  function search(depth: number, chosen: Voicing[]) {
    if (depth === otherIndices.length) {
      const otherNotes = chosen.map((voicing, k) =>
        voicingNotes(allNotes[otherIndices[k]!]!, voicing),
      )
      const allVoicedNotes = [lockedNotes, ...otherNotes].flat()
      const span = Math.max(...allVoicedNotes) - Math.min(...allVoicedNotes)
      const closeness = otherNotes.reduce(
        (sum, notes) => sum + closenessToLocked(notes, lockedNotes),
        0,
      )
      if (span < bestSpan || (span === bestSpan && closeness < bestCloseness)) {
        bestSpan = span
        bestCloseness = closeness
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
