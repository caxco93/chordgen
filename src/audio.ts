/**
 * Two synths built directly on the Web Audio API, selectable per chord.
 *
 * 'piano' is additive: each note is a handful of sine partials whose
 * frequencies are slightly stretched above the exact harmonic series (as on
 * a real struck string), each played as a gently detuned unison pair for a
 * touch of chorus. Upper partials are quieter and decay faster than the
 * fundamental, and a lowpass filter whose cutoff falls over the life of the
 * note dulls the tone further as it rings out. A short burst of filtered
 * noise at onset stands in for the hammer strike.
 *
 * 'block' is the simpler synth this one replaced: every note in the chord is
 * a plain triangle oscillator under one shared envelope.
 *
 * Both share a master bus through a compressor so full chords don't clip.
 */

export type Instrument = 'piano' | 'block'

export const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'block', label: 'Synth I' },
]

let context: AudioContext | null = null
let masterGain: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

/** A currently-sounding voice, kept around so `stopAll` can release it early. */
interface Voice {
  gain: GainNode
}

let sounding: Voice[] = []

// Shared release used when `stopAll` cuts a voice off early, regardless of instrument.
const STOP_RELEASE_SECONDS = 0.08

// Piano: overall note envelope. Fast attack, exponential decay while held, release on note-off.
const PIANO_NOTE_GAIN = 0.16
const PIANO_ATTACK_SECONDS = 0.005
const PIANO_SUSTAIN_LEVEL = 0.35 // fraction of PIANO_NOTE_GAIN the note decays to before release

// Piano: harmonic structure. A handful of partials, slightly inharmonic like a real string.
const PARTIAL_COUNT = 6
const INHARMONICITY = 0.0003
const PARTIAL_DECAY_SECONDS = 0.9 // fundamental's decay time constant; partial n decays this / n

// Piano: gentle detuned unison pair per partial, for a touch of chorus.
const UNISON_DETUNE_CENTS = 4

// Piano: brightness. A lowpass filter that closes over the course of the note.
const FILTER_START_HZ = 7000
const FILTER_END_HZ = 1100
const FILTER_DECAY_SECONDS = 1.2

// Piano: hammer-strike transient. A short burst of filtered noise at note onset.
const HAMMER_DURATION_SECONDS = 0.02
const HAMMER_GAIN = 0.4
const HAMMER_HIGHPASS_HZ = 800

// Block chord: the whole chord shares one envelope.
const BLOCK_NOTE_GAIN = 0.12
const BLOCK_ATTACK_SECONDS = 0.02
const BLOCK_RELEASE_SECONDS = 0.05

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

/** A short burst of white noise, generated once and reused for every piano note's hammer transient. */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const length = Math.ceil(ctx.sampleRate * HAMMER_DURATION_SECONDS)
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

/** Registers a voice and arranges for it to disconnect its own nodes once `lastNode` finishes playing. */
function trackVoice(
  gain: GainNode,
  nodes: AudioNode[],
  lastNode: OscillatorNode | AudioBufferSourceNode,
) {
  const voice: Voice = { gain }
  sounding.push(voice)
  lastNode.onended = () => {
    for (const node of nodes) node.disconnect()
    const index = sounding.indexOf(voice)
    if (index !== -1) sounding.splice(index, 1)
  }
}

/** A piano note that has started sounding but has no scheduled end yet. */
interface PianoNote {
  noteGain: GainNode
  oscillators: OscillatorNode[]
  nodes: AudioNode[]
}

/**
 * Starts a single piano note: a stack of detuned, slightly inharmonic partials plus a
 * hammer-noise transient, with a brightness filter that closes over time. The caller
 * shapes the rest of the envelope and stops the oscillators.
 */
function startPianoNote(
  ctx: AudioContext,
  destination: AudioNode,
  midi: number,
  now: number,
  velocity: number,
): PianoNote {
  const frequency = midiToFrequency(midi)

  const noteGain = ctx.createGain()
  noteGain.gain.setValueAtTime(0, now)
  noteGain.gain.linearRampToValueAtTime(PIANO_NOTE_GAIN * velocity, now + PIANO_ATTACK_SECONDS) // fast hammer-strike attack
  noteGain.connect(destination)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(FILTER_START_HZ, now)
  filter.frequency.exponentialRampToValueAtTime(FILTER_END_HZ, now + FILTER_DECAY_SECONDS) // tone dulls as the note rings out
  filter.connect(noteGain)

  // Keep every node this note creates so it can all be disconnected once the note finishes.
  const nodes: AudioNode[] = [noteGain, filter]
  const oscillators: OscillatorNode[] = []

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
      nodes.push(oscillator)
      oscillators.push(oscillator)
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

  return { noteGain, oscillators, nodes }
}

/** Plays a piano note for a fixed duration. */
function playPianoNote(
  ctx: AudioContext,
  destination: AudioNode,
  midi: number,
  now: number,
  seconds: number,
) {
  const { noteGain, oscillators, nodes } = startPianoNote(ctx, destination, midi, now, 1)
  const releaseStart = Math.max(now + PIANO_ATTACK_SECONDS, now + seconds - STOP_RELEASE_SECONDS)
  noteGain.gain.exponentialRampToValueAtTime(PIANO_NOTE_GAIN * PIANO_SUSTAIN_LEVEL, releaseStart) // decay while the string rings
  noteGain.gain.linearRampToValueAtTime(0, now + seconds) // release when the note ends
  for (const oscillator of oscillators) oscillator.stop(now + seconds)

  // The oscillators all stop together, so the last one's 'ended' event marks the note as finished.
  trackVoice(noteGain, nodes, oscillators[oscillators.length - 1]!)
}

/** Plays every note of the chord as a plain triangle oscillator under one shared envelope. */
function playBlockChord(
  ctx: AudioContext,
  destination: AudioNode,
  midiNotes: number[],
  now: number,
  seconds: number,
) {
  const output = ctx.createGain()
  output.gain.setValueAtTime(0, now)
  output.gain.linearRampToValueAtTime(BLOCK_NOTE_GAIN, now + BLOCK_ATTACK_SECONDS)
  output.gain.setValueAtTime(BLOCK_NOTE_GAIN, now + seconds - BLOCK_RELEASE_SECONDS)
  output.gain.linearRampToValueAtTime(0, now + seconds)
  output.connect(destination)

  const nodes: AudioNode[] = [output]
  let lastOscillator: OscillatorNode | null = null
  for (const midi of midiNotes) {
    const oscillator = ctx.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.value = midiToFrequency(midi)
    oscillator.connect(output)
    oscillator.start(now)
    oscillator.stop(now + seconds)
    nodes.push(oscillator)
    lastOscillator = oscillator
  }

  trackVoice(output, nodes, lastOscillator!)
}

/** Plays the MIDI notes together as a chord for the given duration, on the given instrument. */
export function playChord(midiNotes: number[], seconds: number, instrument: Instrument = 'piano') {
  const { context: ctx, masterGain: destination } = getAudioGraph()
  const now = ctx.currentTime
  if (instrument === 'block') {
    playBlockChord(ctx, destination, midiNotes, now, seconds)
  } else {
    for (const midi of midiNotes) playPianoNote(ctx, destination, midi, now, seconds)
  }
}

/** Starts a note that sounds until released, returning the function that releases it. */
type StartHeld = (
  ctx: AudioContext,
  destination: AudioNode,
  midi: number,
  velocity: number,
) => () => void

const startHeldPiano: StartHeld = (ctx, destination, midi, velocity) => {
  const now = ctx.currentTime
  const { noteGain, oscillators, nodes } = startPianoNote(ctx, destination, midi, now, velocity)
  noteGain.gain.setTargetAtTime(
    PIANO_NOTE_GAIN * velocity * PIANO_SUSTAIN_LEVEL,
    now + PIANO_ATTACK_SECONDS,
    PARTIAL_DECAY_SECONDS,
  )
  return () => {
    const end = ctx.currentTime + STOP_RELEASE_SECONDS
    noteGain.gain.cancelScheduledValues(ctx.currentTime)
    noteGain.gain.setValueAtTime(noteGain.gain.value, ctx.currentTime)
    noteGain.gain.linearRampToValueAtTime(0, end)
    for (const oscillator of oscillators) oscillator.stop(end)
    oscillators[oscillators.length - 1]!.onended = () => {
      for (const node of nodes) node.disconnect()
    }
  }
}

const startHeldBlock: StartHeld = (ctx, destination, midi, velocity) => {
  const now = ctx.currentTime
  const output = ctx.createGain()
  output.gain.setValueAtTime(0, now)
  output.gain.linearRampToValueAtTime(BLOCK_NOTE_GAIN * velocity, now + BLOCK_ATTACK_SECONDS)
  output.connect(destination)

  const oscillator = ctx.createOscillator()
  oscillator.type = 'triangle'
  oscillator.frequency.value = midiToFrequency(midi)
  oscillator.connect(output)
  oscillator.start(now)
  return () => {
    const end = ctx.currentTime + BLOCK_RELEASE_SECONDS
    output.gain.cancelScheduledValues(ctx.currentTime)
    output.gain.setValueAtTime(output.gain.value, ctx.currentTime)
    output.gain.linearRampToValueAtTime(0, end)
    oscillator.stop(end)
    oscillator.onended = () => {
      oscillator.disconnect()
      output.disconnect()
    }
  }
}

const heldReleasers = new Map<number, () => void>()

/** Starts a note on the given instrument that sounds until `noteOff`. Velocity is 0–1 and scales the volume. */
export function noteOn(midi: number, velocity: number, instrument: Instrument = 'piano') {
  noteOff(midi)
  const { context: ctx, masterGain: destination } = getAudioGraph()
  const start = instrument === 'block' ? startHeldBlock : startHeldPiano
  heldReleasers.set(midi, start(ctx, destination, midi, velocity))
}

/** Releases a note started with `noteOn`. */
export function noteOff(midi: number) {
  heldReleasers.get(midi)?.()
  heldReleasers.delete(midi)
}

/** Fades out anything still sounding. */
export function stopAll() {
  if (!context) return
  for (const midi of [...heldReleasers.keys()]) noteOff(midi)
  const now = context.currentTime
  for (const voice of sounding) {
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now)
    voice.gain.gain.linearRampToValueAtTime(0, now + STOP_RELEASE_SECONDS)
  }
  sounding = []
}
