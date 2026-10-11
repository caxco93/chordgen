# chordgen

A chord progression generator with piano diagrams, inversions, octaves and playback.

![chordgen showing a C–G–Am–F progression above a full piano keyboard](docs/screenshot.png)

## Features

- **Random progressions**: reroll for a new key, and choose which keys the I chord may land on.
- **Progression presets**: pick a preset such as I–V–vi–IV or type your own in Roman numerals.
- **Lock**: when locked, changing one chord's root moves the whole progression with it. Unlock to choose chords independently.
- **Piano diagrams**: each chord shows its voicing on a keyboard.
- **Inversions and octaves**: step each chord through its inversions and octaves, or shift every octave at once.
- **Optimize inversions**: pick inversions that keep the voice leading smooth between neighbouring chords.
- **Full piano preview**: the chord you hover or adjust lights up across all 88 keys.
- **Playback**: play the progression with sound, loop it and set the tempo (BPM).

## Getting started

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check and build to dist/
npm run preview  # serve the production build locally
```

## Built with

[Vue 3](https://vuejs.org/), [TypeScript](https://www.typescriptlang.org/) and [Vite](https://vite.dev/). Audio is synthesised in the browser, so there are no sample files.

## Deployment

The `Dockerfile` builds the app and serves it with nginx, ready to deploy on Coolify or any container host.
