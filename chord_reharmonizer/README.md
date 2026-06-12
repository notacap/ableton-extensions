# Chord Reharmonizer

> **Status: v2 — UX overhaul complete, not yet deployed.** Internal working notes, not a public-facing README.

An **Ableton Live 12 extension** built with the `@ableton-extensions/sdk` and a self-contained
music-theory engine. It's a sibling to **Chord Progression Builder (CPB)**: where CPB *writes* a
new looped progression from scratch, Chord Reharmonizer *transforms an existing one* — you
right-click a MIDI clip, pick a section of the progression, and add a **turnaround**,
**chromatic approach chord**, or **passing chords**, auditioning everything in place before
dropping it in.

## Purpose

Take a finished chord loop (e.g. one CPB produced) and reharmonize a chosen section of it without
hand-editing MIDI. Select bars/beats, choose a reharmonization technique, audition it in context,
and apply. The tool handles the theory (which chords are available, how they voice, where they sit
in time) so you stay focused on the musical choice.

## How it works

1. **Right-click a MIDI clip → "Reharmonize Section…".** The extension reads the clip's notes and
   loop length, snapshots the Live Set's key + tempo, and opens the dialog (space-nebula theme,
   same design language as CPB's studio-at-night).
2. **The clip is analyzed into chord blocks** laid out on a bar/beat timeline, colored by a
   circle-of-fifths hue wheel (harmonically close chords get chromatically close colors).
3. **Select a section** to rewrite (see *Selecting a section* below). The originals inside the
   selection dim, and a **ghost preview of your rewrite renders in place** over them.
4. **Add a reharmonization** from one of the technique tabs, place chords by hand from the key
   palette, or hit **🎲 Reimagine** for a random tasteful idea. Every tap makes a sound.
5. **Listen** to the whole progression looping at project tempo — a playhead sweeps the timeline
   and each chord lights up as it sounds — then **✦ Drop it in**.

The extension stays a thin reader/writer: it only reads the clip + key at open time and applies the
final rewrite. *All* analysis, editing, and rendering happen client-side in the dialog webview,
with no round-trips in between (same architecture as CPB).

## Features

### Section selection (two ways)
- **Click a chord block** to select it (you hear its actual notes); **shift-click** extends the span.
- **Drag across the timeline** to select an arbitrary range (snaps to a ½-beat grid).
- The selection has **draggable edge handles** and a **draggable middle** for fine-tuning, with a
  live `rewriting N beats · from bar X` readout.
- Adjusting an edge does **not** wipe the chords you've already built into the section — only a
  fresh drag or a new chord-click reseeds it.

### Sound previews everywhere (CPB parity)
- Three Web Audio instruments — **Piano / Electric Piano / Synth** (or Muted) — shared with CPB.
- Tapping a timeline block, a rewrite card, or any palette/technique chip **plays it instantly**;
  applying a turnaround auto-plays the rewritten section with its resolution.
- **▶ Listen** plays the *entire progression* (original notes outside the selection, your rewrite
  inside it) at the project tempo, with a **Loop** toggle so it cycles while you tweak — edits made
  mid-loop are picked up on the next pass. **▶ Section** auditions just the rewrite + one beat of
  the chord it resolves into.
- A comet **playhead** sweeps the timeline in sync; blocks, cards, and ghosts pulse as they sound.

### Reharmonization techniques
All technique suggestions are **context-aware**: they read the chord that *follows* your selection
(looping back to the top of the progression where relevant) and offer the musically correct options.

- **Turnarounds** — cadential templates that lead back to the next chord: `ii–V`, `I–vi–ii–V`,
  `iii–vi–ii–V`, a secondary-dominant variant, a tritone-sub turnaround, and a passing-diminished
  turnaround. Clicking one fills the section and plays it.
- **Approach** — a short chord placed right before the next chord: tritone-sub from above,
  half-step below, the secondary dominant, a leading-tone °7, or a parallel chord a half-step up.
- **Passing** — a chord that bridges the preceding chord and the next one.
- **All chords** — every diatonic and borrowed chord in the key; chords that pull toward the next
  chord are **★ starred**.
- **🎲 Reimagine** — fills the section with a random turnaround or approach idea and plays it.

### The rewrite editor
- Seeds with the original chords in the selection (weighted by their real durations; dashed border
  marks "from your original clip").
- Cards are **drag-to-reorder**; clicking one opens a **plain-words inspector**: `½× shorter /
  2× longer` with a live beats readout, `← earlier / later →`, `⧉ duplicate`, `✕ remove` — no
  ambiguous glyph clusters. Keyboard: `1–7` add scale-degree chords, `←/→` select, `Shift+←/→`
  reorder, `⌫` remove, `Space` listen, `⏎` apply.
- **Color chips (CPB parity)** — per-card extensions/sus/altered tensions from CPB's
  `CHORD_COLORS` table (Triad / 7th / 9th / 13th / 6 / 6-9 / ♯11 / sus / ♭9 / ♯9 … per chord
  type), plus sets for the extra types the reharmonizer can *detect* (`6`, `m6`, `dim`, `aug`).
  A card's **default color is its own detected sound** (a seeded C°7 stays C°7); picking any
  other color renames the card CPB-style (`Cmaj7` + 9th → `Cmaj9`).
- **Voicing chips (CPB parity)** — Close / 1st inv / 2nd inv / Open (drop-2) / Drop-3 / Wide /
  Rootless / Shell, recomputed from the canonical close position so transforms never compound.
  Rootless/Shell are disabled without a 7th, Drop-3 below 4 notes, and a color change that
  removes the 7th falls back to Close automatically. Register anchoring and Smooth voices apply
  on top, exactly as before.
- **Register anchoring** — new chords are octave-shifted into the same register as the original
  material, so the rewrite sits *in* the part instead of jumping to middle C.
- **Smooth voices** (optional) — auto voice-leading seeded from the notes sounding just before the
  selection, so the new chords flow out of what precedes them.
- **Velocity** slider + **Humanize** toggle (timing/velocity drift) for the written chords.
- **↺ Original chords** / **clear all** (an empty section is valid — applying clears those beats).

### Key handling
- Defaults to the **Live Set's root + scale**; if the scale is unset, you pick one.
- **Override** the key/mode at any time — palette, roman numerals, and suggestions update, and your
  card edits are preserved.

### Output — razor-edit apply
- Applying **slices the original notes at the selection boundaries**: a chord that starts before
  the selection keeps its head, one that rings past it keeps its tail, one spanning the whole
  region keeps both. Only the part inside the span is replaced — selecting the last ¼ note of a
  1-bar chord no longer deletes the whole chord.
- Two destinations (dropdown next to the apply button):
  - **into this clip** (default) — rewrites the source clip in place as **one undo step**; works
    for session *and* arrangement clips.
  - **as a new clip** — leaves the original untouched and writes the merged result to the next
    empty session slot (named `"<original> (reharm)"`), appending a scene if every slot is full.
- Inserted chords use CPB's deterministic **close voicing**, register-anchored, as sustained
  block chords. The preview engine performs the *same* slice-merge, so what you hear is what
  you get.

## Build & run

```bash
npm install
npm run build       # tsc --noEmit type-check, then esbuild bundle (production)
npm run build:dev   # same, with sourcemaps, no minify
npm run start       # build:dev, then load into Live via extensions-cli (needs Live running)
npm run package     # production build, then package into a distributable .ablx
```

Running in Live needs **Developer Mode** enabled (*Preferences → Extensions*) and
`EXTENSION_HOST_PATH` set in `.env`. Logs go to `ExtensionHost.txt`.

## Implementation notes

- **`src/extension.ts`** — SDK activation, the `tonal`-based chord palette (diatonic + curated
  borrowed chords per mode, ported from CPB), the clip/key snapshot, and `writeReharmonizedClip`
  (boundary slicing + in-place/new-clip apply). Registers `crh.open` on the `MidiClip`
  context-menu scope.
- **`src/dialog.html`** — the entire UI and engine: a self-contained close-voicing + chord-detection
  implementation (the webview has no `tonal`), clip→chord-block analysis, the timeline + selection
  state-machine, the ghost-preview renderer, the technique generators, register anchoring + auto
  voice-leading, the CPB audio instruments + loop transport, and the postMessage bridge.
- Data crosses the boundary exactly twice: `{ roots, modes, palette, live, clip }` baked into the
  dialog at open time (string-replacing the `/*__DATA__*/null` placeholder), and a final
  `{ action: 'apply', target, regionStart, regionEnd, notes }` posted back on apply
  (`target` is `"replace"` or `"new"`; an empty `notes` list means "clear the span").

## Known limitations / caveats

- **Assumes 4/4** — the SDK doesn't expose the clip's time signature, so the bar grid is fixed at 4
  beats/bar.
- **Chord-block detection is heuristic** (slice-and-merge by pitch-class set, with the bass note as a
  root hint). It's tuned for root-position block chords like CPB output; dense or arpeggiated clips
  may over-segment — the drag-select fallback covers those cases.
- **Block-chord output only** — inserted chords are sustained blocks; they don't yet match the
  existing clip's rhythmic pattern or per-chord velocity.
- **"As a new clip" writes to a session slot** — for arrangement clips, use the default in-place
  mode (which fully supports them).
- **Not yet tested end-to-end in Live** — builds, type-checks, and the dialog logic is reviewed,
  but the in-host run (WebView bridge + real clip write) is still unverified.
