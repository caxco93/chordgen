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

/** Fades out anything still sounding. */
export function stopAll() {
  if (!context) return
  const now = context.currentTime
  for (const output of sounding) {
    output.gain.cancelScheduledValues(now)
    output.gain.setValueAtTime(output.gain.value, now)
    output.gain.linearRampToValueAtTime(0, now + RELEASE_SECONDS)
  }
  sounding = []
}
