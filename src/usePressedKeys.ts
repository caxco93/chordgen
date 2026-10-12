import { type Ref, ref } from 'vue';
import { type Instrument, noteOff, noteOn } from './audio';

/**
 * Holds notes down on the selected instrument, whether from MIDI or the on-screen keyboard.
 * `pressed` holds the MIDI notes currently held down.
 */
export function usePressedKeys(instrument: Ref<Instrument>) {
  const pressed = ref<number[]>([]);

  /** Starts `note` sounding and marks it held. Velocity is 0–1. */
  function press(note: number, velocity: number) {
    noteOn(note, velocity, instrument.value);
    if (!pressed.value.includes(note)) {
      pressed.value = [...pressed.value, note];
    }
  }

  function release(note: number) {
    noteOff(note);
    pressed.value = pressed.value.filter((n) => n !== note);
  }

  function releaseAll() {
    for (const note of pressed.value) {
      noteOff(note);
    }
    pressed.value = [];
  }

  return { pressed, press, release, releaseAll };
}
