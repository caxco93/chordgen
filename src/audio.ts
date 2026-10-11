let context: AudioContext | null = null
let sounding: GainNode[] = []

const NOTE_GAIN = 0.12
const ATTACK_SECONDS = 0.02
const RELEASE_SECONDS = 0.05

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** Plays the MIDI notes together as a block chord for the given duration. */
export function playChord(midiNotes: number[], seconds: number) {
  context ??= new AudioContext()
  void context.resume()

  const now = context.currentTime
  const output = context.createGain()
  output.gain.setValueAtTime(0, now)
  output.gain.linearRampToValueAtTime(NOTE_GAIN, now + ATTACK_SECONDS)
  output.gain.setValueAtTime(NOTE_GAIN, now + seconds - RELEASE_SECONDS)
  output.gain.linearRampToValueAtTime(0, now + seconds)
  output.connect(context.destination)

  for (const midi of midiNotes) {
    const oscillator = context.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.value = midiToFrequency(midi)
    oscillator.connect(output)
    oscillator.start(now)
    oscillator.stop(now + seconds)
  }
  sounding.push(output)
}

const held = new Map<number, { oscillator: OscillatorNode; output: GainNode }>()

/** Starts a note that sounds until `noteOff`. Velocity is 0–1 and scales the volume. */
export function noteOn(midi: number, velocity: number) {
  noteOff(midi)
  context ??= new AudioContext()
  void context.resume()

  const now = context.currentTime
  const output = context.createGain()
  output.gain.setValueAtTime(0, now)
  output.gain.linearRampToValueAtTime(NOTE_GAIN * velocity, now + ATTACK_SECONDS)
  output.connect(context.destination)

  const oscillator = context.createOscillator()
  oscillator.type = 'triangle'
  oscillator.frequency.value = midiToFrequency(midi)
  oscillator.connect(output)
  oscillator.start(now)
  held.set(midi, { oscillator, output })
}

/** Releases a note started with `noteOn`. */
export function noteOff(midi: number) {
  const note = held.get(midi)
  if (!note || !context) return
  const { oscillator, output } = note
  held.delete(midi)
  const now = context.currentTime
  output.gain.cancelScheduledValues(now)
  output.gain.setValueAtTime(output.gain.value, now)
  output.gain.linearRampToValueAtTime(0, now + RELEASE_SECONDS)
  oscillator.stop(now + RELEASE_SECONDS)
}

/** Fades out anything still sounding. */
export function stopAll() {
  if (!context) return
  for (const midi of [...held.keys()]) noteOff(midi)
  const now = context.currentTime
  for (const output of sounding) {
    output.gain.cancelScheduledValues(now)
    output.gain.setValueAtTime(output.gain.value, now)
    output.gain.linearRampToValueAtTime(0, now + RELEASE_SECONDS)
  }
  sounding = []
}
