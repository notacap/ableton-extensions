# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An **Ableton Live 12 extension** ("Chord Progression Builder") built with the
`@ableton-extensions/sdk` (1.0.0-beta.0, vendored under `vendor/`) and the `tonal`
music-theory library. It adds a **"Build Chord Progression…"** context-menu action
to MIDI tracks. The dialog opens pre-set to the Live Set's key/scale, the user
picks chords (or loads a genre preset / rolls the dice), colors them with
extensions (9ths/13ths/sus), shapes voicings and rhythm patterns, auditions at
the project tempo, then writes the result as a single looped MIDI clip.

Requires Node >= 22.11 and (to actually run) Ableton Live Suite 12.4.5+.

## Commands

```bash
npm run build       # tsc --noEmit type-check, then esbuild bundle (minified, production)
npm run build:dev   # same, but with sourcemaps and no minify
npm run start       # build:dev, then launch the extension in Live via extensions-cli
npm run package     # production build, then package into a distributable .ablx
```

There is **no test suite, linter, or test runner** — `tsc --noEmit` (run as part of
every build) is the only static check. Don't invent test commands.

`npm run start` needs Live running and `EXTENSION_HOST_PATH` set in `.env` (path to
the Live extension host). Without that, you can only build/typecheck.

## Architecture — the one thing to understand

**All chord data is precomputed at activation, baked into the dialog HTML as a
string, and all editing happens in the webview with zero round-trips to the
extension.** The extension process only does two things: generate the palette
(plus a Live tempo/scale snapshot at open time), and write the final MIDI clip
when the user clicks "Write to Live".

The boundary has exactly two crossings:

1. **Extension → webview (one-shot, at open time).** In `activate`
   (`src/extension.ts`), `buildDiatonic`/`buildBorrowed` precompute a `palette` for
   every root × mode (`MODES` × `ROOTS`). On `cpb.open`, the Live Set's
   `tempo`/`rootNote`/`scaleName`/`scaleMode` are snapshotted into a `live` object,
   and the whole `{ roots, modes, palette, live }` object is injected by
   string-replacing the literal `/*__DATA__*/null` placeholder in `dialog.html`
   with `JSON.stringify(allData)`. The webview reads it as
   `const ALL_DATA = /*__DATA__*/null;`. **This placeholder string must stay
   byte-identical on both sides** or injection silently breaks.

2. **Webview → extension (one-shot, on Write).** The webview renders the final
   performance itself and calls
   `postToHost({ action: 'write', clipName, lengthBeats, notes })` — `notes` is a
   ready-to-write list of `{ pitch, startTime, duration, velocity }` in beats.
   `postToHost` wraps it as `{ method: "close_and_send", params: [JSON.stringify(data)] }`
   and posts via `window.webkit.messageHandlers.live` (macOS) **or**
   `window.chrome.webview` (Windows) — both must be handled. The extension receives
   this as the resolved value of `await context.ui.showModalDialog(...)`, clamps the
   values, and writes the clip. If the dialog is dismissed (Escape/close),
   `showModalDialog` rejects — that's the normal no-op path, not an error.

So: slot picking, chord colors/extensions, voicing transforms, presets,
next-chord suggestions, the dice generator, the rhythm/performance engine, and
the tempo-synced audio preview are **entirely client-side JS inside
`src/dialog.html`**. The extension never sees intermediate edits and stays a
dumb MIDI writer.

## Where logic lives

- **`src/extension.ts`** — SDK activation, music theory (diatonic + curated
  borrowed chords via `tonal` for 8 modes), the `closeVoicing` MIDI-pitch
  generator, the Live tempo/scale snapshot, and `writeNotesToTrack`. The
  voicing/theory functions are deterministic and commented; preserve that.
- **`src/dialog.html`** — the entire UI (~1300 lines): slot interaction, the
  `CHORD_COLORS` extension layer, voicing transforms, auto voice-leading,
  `PRESETS` / `SUGGEST` / dice, the rhythm engine (`slotEvents` /
  `buildPerformance`), Web Audio preview instruments, and the postMessage
  contract. Bundled into the JS via esbuild's `".html": "text"` loader (see
  `build.ts`), surfaced to TS by the `declare module "*.html"` shim in
  `src/html.d.ts`.
- **`build.ts`** — esbuild config. Bundles `src/extension.ts` to `manifest.entry`
  (`dist/extension.js`) as CJS for the Node platform. Don't change the format/loader
  without reason — the `.html` text loader is load-bearing.

## Music-theory conventions

- 8 modes: Major, Minor, Dorian, Mixolydian, Lydian, Phrygian, Harmonic Minor,
  Melodic Minor. Diatonic qualities, roman numerals, and curated borrowed chords
  are hardcoded per mode in `DIATONIC_TYPES`, `DIATONIC_ROMAN`, and `BORROWED`
  (extension.ts). Adding/changing a chord means editing these tables, not the
  generation code.
- `SEVENTH_TYPES` marks 4-note chord types (the `seventh` flag on `ChordInfo`,
  which picks the default color and gates Rootless/Shell).
- `closeVoicing` anchors every chord's root into MIDI [54..65] (F#3–F4) so chords
  stay centered around C3–C5 regardless of key, then stacks tones upward. It's
  intentionally deterministic — same input always yields the same array.
- Chord **colors/extensions** (9th, 13th, sus…) live in the webview's
  `CHORD_COLORS` table as interval sets per chord type; display names are
  `rootName + suffix`. Presets and the suggestion graph reference chords **by
  roman label**, so roman strings in `PRESETS`/`SUGGEST` (dialog.html) must
  exactly match the strings in `DIATONIC_ROMAN`/`BORROWED` (extension.ts) —
  including the unicode ♭/♯/°/ø characters.

## MIDI write contract

The webview sends a finished performance: `{ action: 'write', clipName,
lengthBeats, notes: [{ pitch, startTime, duration, velocity }] }` (beats,
already patterned/humanized/voice-led). `writeNotesToTrack` re-resolves the
track from the live `song.tracks` by `handle.id` (SDK handles must not be
cached across the dialog), finds the first **empty** session slot — and if
every slot is full, appends a new scene via `song.createScene(-1)` so the
write never fails — then `createMidiClip(lengthBeats)`, sets
name/notes/`looping = true` inside one `withinTransaction`. Note values are
clamped defensively before writing.

## Reference material

- `prompts/build_v1.md` — the original build spec, including the **verified SDK
  contract** (exact API signatures). Treat it as the source of truth for SDK usage;
  do not invent SDK APIs.
- `documentation/architecture.md` — the data-flow / feature design doc.
- `download/ableton-live-extensions/extensions/chord-progression-helper/` — the MIT
  reference extension this project's plumbing (manifest/build/tsconfig/postMessage/
  Web Audio) was adapted from. Useful for SDK patterns, but its UI is grid-based and
  intentionally **not** copied (this project uses a slot-based UI).
- The `ableton-extensions` skill is available for scaffolding/SDK help.

## Gotchas

- `.ablx` files, `dist/`, `download/`, and `.env` are gitignored. The committed
  `Chord-Progression-Builder-1.0.0.ablx` at the root is a build artifact.
- This directory is **not** a git repo (the only `.git` is inside the vendored
  `download/ableton-live-extensions` reference clone).
