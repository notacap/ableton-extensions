# Root Split

A context-menu extension for **Ableton Live 12** that splits a chord MIDI clip into
two new clips: one holding only the **root note** of every chord, the other holding
every **non-root** note.

Right-click a MIDI clip made of chords and pick a Root Split action. Two new clips
appear in the next empty Session slots on the same track — a root line named **Bass**
or **Root** (depending on the method you pick) and an upper-voices clip that keeps the
**original clip's name** — both the same length and color as the original. Great for
extracting a bassline, re-orchestrating the upper structure onto another instrument, or
layering roots and colors with different sounds.

## Two ways to split

Right-clicking a MIDI clip gives you two menu items — they differ only in **what counts
as the root** of each chord:

- **Root Split — Bass Note.** The lowest note in each chord is the root. Simple and
  fully predictable: whatever sits in the bass is treated as the root.
- **Root Split — Chord Root.** Detects each chord and uses its true **harmonic root**,
  so an inversion like **C/E** (E–G–C) still roots on **C**, not the bass E. Falls back
  to the bass note when a chord is too ambiguous to name.

For chords in root position the two modes agree. They only differ on **inversions** —
use *Chord Root* when your voicings are inverted and you want the harmonically correct
root line.

## How it works

- A **chord** is a group of notes that start at (about) the same time (small timing
  differences from humanization are tolerated).
- Each chord contributes exactly **one** note to the *Roots* clip (its root); all of its
  other notes go to the *Other* clip.
- A lone note that isn't part of a chord is treated as its own root (it lands in the
  *Roots* clip).
- The action only runs when the clip actually contains chords. If every note plays on
  its own, Root Split tells you and does nothing.

## Requirements

- **Ableton Live Suite 12.4.5 or newer** (Extensions require Live Suite).

## Install

1. Download `Root-Split-1.0.0.ablx` from the
   [**Releases page**](https://github.com/notacap/ableton-extensions/releases).
2. In Live, open **Preferences → Extensions**.
3. Drag the `.ablx` file into the Extensions list (or use the install button).
4. Right-click any **MIDI clip** of chords and choose a **Root Split** action.

> Note: Extensions are a Live Suite feature. The first time you install a community
> extension you may need to confirm the install in Live's dialog.

## How to use

1. In Session view, right-click a MIDI **clip** that contains chords.
2. Choose **Root Split — Bass Note** or **Root Split — Chord Root**.
3. Two new clips appear in the next empty slots on the same track (a scene is added
   automatically if the track is full): one named **Bass** or **Root** (matching the
   method you chose) with the root line, and one keeping the original clip's name with
   the remaining notes.

## Building from source

Requires Node ≥ 22.11.

```bash
npm install
npm run build       # type-check + production bundle
npm run package     # builds, then produces the distributable .ablx
npm run start       # build:dev + launch in Live (needs Live running + EXTENSION_HOST_PATH in .env)
```

## Credits

Built by **hello_nocap** with the
[`@ableton-extensions/sdk`](https://www.ableton.com/) and the
[`tonal`](https://github.com/tonaljs/tonal) music-theory library.

## License

Released under the [MIT License](LICENSE) © 2026 hello_nocap.
