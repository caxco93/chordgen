/**
 * A piano-like synth built directly on the Web Audio API.
 *
 * Each note is additive: a handful of sine partials whose frequencies are
 * slightly stretched above the exact harmonic series (as on a real struck
 * string), each played as a gently detuned unison pair for a touch of
 * chorus. Upper partials are quieter and decay faster than the fundamental,
 * and a lowpass filter whose cutoff falls over the life of the note dulls
 * the tone further as it rings out. A short burst of filtered noise at
 * onset stands in for the hammer strike, and everything passes through a
 * shared compressor so full chords don't clip.
 */

let context: AudioContext | null = null
let masterGain: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

/** A currently-sounding note, kept around so `stopAll` can release it early. */
interface Voice {
  noteGain: GainNode
}

let sounding: Voice[] = []

// Overall note envelope: fast attack, exponential decay while held, release on note-off.
const NOTE_GAIN = 0.16
const ATTACK_SECONDS = 0.005
const SUSTAIN_LEVEL = 0.35 // fraction of NOTE_GAIN the note decays to before release
const RELEASE_SECONDS = 0.08

// Harmonic structure: a handful of partials, slightly inharmonic like a real string.
const PARTIAL_COUNT = 6
const INHARMONICITY = 0.0003
const PARTIAL_DECAY_SECONDS = 0.9 // fundamental's decay time constant; partial n decays this / n

// Gentle detuned unison pair per partial, for a touch of chorus.
const UNISON_DETUNE_CENTS = 4

// Brightness: a lowpass filter that closes over the course of the note.
const FILTER_START_HZ = 7000
const FILTER_END_HZ = 1100
const FILTER_DECAY_SECONDS = 1.2

// Hammer-strike transient: a short burst of filtered noise at note onset.
const HAMMER_DURATION_SECONDS = 0.02
const HAMMER_GAIN = 0.4
const HAMMER_HIGHPASS_HZ = 800

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** Lazily creates the audio graph shared by every voice: a master bus through a compressor so chords don't clip. */
function getAudioGraph(): { context: AudioContext; masterGain: GainNode } {
  if (!context) {
    context = new AudioContext()
    const compressor = context.createDynamicsCompressor()
    compressor.connect(context.destination)
    masterGain = context.createGain()
    masterGain.connect(compressor)
  }
  void context.resume()
  return { context, masterGain: masterGain! }
}

/** A short burst of white noise, generated once and reused for every note's hammer transient. */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const length = Math.ceil(ctx.sampleRate * HAMMER_DURATION_SECONDS)
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

/**
 * Plays a single note: a stack of detuned, slightly inharmonic partials plus a
 * hammer-noise transient, shaped by a per-note envelope and a brightness
 * filter that closes over time. Registers itself in `sounding` and cleans up
 * its own nodes once the note finishes.
 */
function playNote(ctx: AudioContext, destination: AudioNode, midi: number, now: number, seconds: number) {
  const frequency = midiToFrequency(midi)
  const attackEnd = now + ATTACK_SECONDS
  const releaseStart = Math.max(attackEnd, now + seconds - RELEASE_SECONDS)

  const noteGain = ctx.createGain()
  noteGain.gain.setValueAtTime(0, now)
  noteGain.gain.linearRampToValueAtTime(NOTE_GAIN, attackEnd) // fast hammer-strike attack
  noteGain.gain.exponentialRampToValueAtTime(NOTE_GAIN * SUSTAIN_LEVEL, releaseStart) // decay while the string rings
  noteGain.gain.linearRampToValueAtTime(0, now + seconds) // release when the note ends
  noteGain.connect(destination)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(FILTER_START_HZ, now)
  filter.frequency.exponentialRampToValueAtTime(FILTER_END_HZ, now + FILTER_DECAY_SECONDS) // tone dulls as the note rings out
  filter.connect(noteGain)

  // Keep every node this note creates so it can all be disconnected once the note finishes.
  const nodes: AudioNode[] = [noteGain, filter]
  let lastOscillator: OscillatorNode | null = null

  for (let n = 1; n <= PARTIAL_COUNT; n++) {
    const partialFrequency = frequency * n * Math.sqrt(1 + INHARMONICITY * n * n) // slight stretch above the exact harmonic series

    const partialGain = ctx.createGain()
    partialGain.gain.setValueAtTime(0.5 / n, now) // higher partials start quieter...
    partialGain.gain.setTargetAtTime(0, now, PARTIAL_DECAY_SECONDS / n) // ...and decay faster
    partialGain.connect(filter)
    nodes.push(partialGain)

    for (const detune of [-UNISON_DETUNE_CENTS, UNISON_DETUNE_CENTS]) {
      const oscillator = ctx.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = partialFrequency
      oscillator.detune.value = detune
      oscillator.connect(partialGain)
      oscillator.start(now)
      oscillator.stop(now + seconds)
      nodes.push(oscillator)
      lastOscillator = oscillator
    }
  }

  // Hammer transient: a short, fast-decaying burst of filtered noise at note onset.
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'highpass'
  noiseFilter.frequency.value = HAMMER_HIGHPASS_HZ
  const hammerGain = ctx.createGain()
  hammerGain.gain.setValueAtTime(HAMMER_GAIN, now)
  hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + HAMMER_DURATION_SECONDS)
  noise.connect(noiseFilter)
  noiseFilter.connect(hammerGain)
  hammerGain.connect(noteGain)
  noise.start(now)
  nodes.push(noise, noiseFilter, hammerGain)

  const voice: Voice = { noteGain }
  sounding.push(voice)

  // The oscillators all stop together, last, so their 'ended' event marks the note as finished.
  lastOscillator!.onended = () => {
    for (const node of nodes) node.disconnect()
    const index = sounding.indexOf(voice)
    if (index !== -1) sounding.splice(index, 1)
  }
}

/** Plays the MIDI notes together as a block chord for the given duration. */
export function playChord(midiNotes: number[], seconds: number) {
  const { context: ctx, masterGain: destination } = getAudioGraph()
  const now = ctx.currentTime
  for (const midi of midiNotes) {
    playNote(ctx, destination, midi, now, seconds)
  }
}

/** Fades out anything still sounding. */
export function stopAll() {
  if (!context) return
  const now = context.currentTime
  for (const voice of sounding) {
    voice.noteGain.gain.cancelScheduledValues(now)
    voice.noteGain.gain.setValueAtTime(voice.noteGain.gain.value, now)
    voice.noteGain.gain.linearRampToValueAtTime(0, now + RELEASE_SECONDS)
  }
  sounding = []
}
