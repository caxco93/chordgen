import { computed, onUnmounted, type Ref, ref, watch } from 'vue';
import { type Instrument, playChord, stopAll } from './audio';

const BEATS_PER_BAR = 4;
const MIN_BPM = 30;
const MAX_BPM = 300;

/**
 * Plays a sequence of chords, each held for one bar, repeating while `loop` is
 * set. `chords` yields the MIDI notes of each chord; `currentIndex` is the
 * chord whose bar it currently is. With `sound` off the bars still advance.
 * `instrument` picks which synth (see `./audio`) plays the notes.
 */
export function usePlayback(chords: Ref<number[][]>) {
  const loop = ref(true);
  const sound = ref(true);
  const bpm = ref(120);
  const instrument = ref<Instrument>('piano');
  const currentIndex = ref<number | null>(null);
  const isPlaying = computed(() => currentIndex.value !== null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function barSeconds(): number {
    const clamped = Math.min(Math.max(bpm.value || MIN_BPM, MIN_BPM), MAX_BPM);
    return (BEATS_PER_BAR * 60) / clamped;
  }

  function playBar(index: number) {
    if (index >= chords.value.length) {
      if (!loop.value) {
        stop();
        return;
      }
      index = 0;
    }
    const seconds = barSeconds();
    currentIndex.value = index;
    if (sound.value) {
      playChord(chords.value[index]!, seconds, instrument.value);
    }
    timer = setTimeout(() => playBar(index + 1), seconds * 1000);
  }

  function stop() {
    clearTimeout(timer);
    stopAll();
    currentIndex.value = null;
  }

  watch(sound, (enabled) => {
    if (!enabled) {
      stopAll();
    }
  });

  function toggle() {
    if (isPlaying.value) {
      stop();
    } else {
      playBar(0);
    }
  }

  onUnmounted(stop);

  return { bpm, loop, sound, instrument, currentIndex, isPlaying, toggle, stop, MIN_BPM, MAX_BPM };
}
