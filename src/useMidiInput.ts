import { onMounted, onUnmounted } from 'vue'
import { noteOff, noteOn } from './audio'

const NOTE_OFF = 0x80
const NOTE_ON = 0x90
const MAX_VELOCITY = 127

/** Plays notes from any connected MIDI input device, scaled by key velocity. */
export function useMidiInput() {
  let access: MIDIAccess | undefined

  function handleMessage(event: MIDIMessageEvent) {
    const [status = 0, note = 0, velocity = 0] = event.data ?? []
    const type = status & 0xf0
    // A note-on with velocity 0 is the running-status way of sending note-off.
    if (type === NOTE_ON && velocity > 0) noteOn(note, velocity / MAX_VELOCITY)
    else if (type === NOTE_OFF || type === NOTE_ON) noteOff(note)
  }

  function listen() {
    if (!access) return
    for (const input of access.inputs.values()) input.onmidimessage = handleMessage
  }

  onMounted(async () => {
    if (!navigator.requestMIDIAccess) return
    try {
      access = await navigator.requestMIDIAccess()
    } catch {
      return // Permission denied; MIDI input is optional.
    }
    listen()
    access.onstatechange = listen // Picks up devices plugged in later.
  })

  onUnmounted(() => {
    if (!access) return
    access.onstatechange = null
    for (const input of access.inputs.values()) input.onmidimessage = null
  })
}
