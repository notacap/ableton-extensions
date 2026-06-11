# Chord Progression Builder — "Cheat Code" Enhancement Plan

The v1 extension proves the plumbing. This plan upgrades it from "useful sketchpad" to
**genuine cheat code**: a tool where a producer opens the dialog, gets handed the key of
their session, clicks one preset to land a proven progression, colors it with 9ths/13ths,
hears it at the project tempo with a real performance feel, and writes a clip that sounds
*produced* — all in under a minute.

Design lens: *how does a hit-making producer actually work?* They don't think in scale
degrees — they think "give me the sad one", "make it more expensive", "push it like a
pop record", "what chord goes next?". Every feature below maps to one of those asks.

Architecture stays the same (palette baked into the dialog at open time, zero mid-edit
round-trips, one postMessage back on Write). The webview gets smarter; the extension
gets *simpler* (it becomes a dumb, reliable MIDI writer).

---

## Phase 1 — Harmony engine (extension.ts)

- [x] **8 modes** (was 3): add Mixolydian, Lydian, Phrygian, Harmonic Minor, Melodic
      Minor — with correct diatonic 7th-chord quality tables and roman numerals.
      Covers pop/EDM (Major/Minor), funk/blues (Mixolydian), film/dream-pop (Lydian),
      trap/flamenco (Phrygian), and the V7-in-minor sounds (Harmonic/Melodic Minor).
- [x] **Expanded borrowed/spice tables** per mode: secondary dominants (V7/ii, V7/IV,
      V7/V, V7/vi), tritone sub (♭II7), gospel passing diminisheds (♯i°7, ♯iv°7),
      blues dominants (IV7/V7 in Mixolydian), Neapolitan, Picardy.
- [x] **`rootName` baked into each ChordInfo** so the webview can rename chords when
      the color/extension layer changes them (Cmaj7 → Cmaj9).
- [x] **Live-aware context injection**: at dialog-open time, read `song.tempo`,
      `song.rootNote`, `song.scaleName`, `song.scaleMode` and inject alongside the
      palette. Dialog opens pre-set to the session's key/scale with a "♪ from Live"
      badge, and previews at the project tempo.
- [x] Keep the `/*__DATA__*/null` placeholder mechanism byte-identical.

## Phase 2 — Color & voicing layer (dialog.html)

- [x] **Per-slot chord color (extensions)**: Triad / 7th / 9th / 11th / 13th / 6 / 6-9 /
      sus2 / sus4 / 7♭9 / 7♯9 / maj7♯11 — availability driven by a static interval
      table keyed by chord type. This is the "make it expensive" button: one click
      turns Am7 into Am11, G7 into G13.
- [x] **New voicings**: Drop-3 and Wide (root dropped an octave) added to Close,
      1st/2nd inversion, Open (drop-2), Rootless, Shell. Gating (Rootless/Shell)
      derived from the *colored* note set, not just the base chord.
- [x] **Real voice-leading** (upgrade from octave-shift-only): candidate search over
      inversions × octave shifts, minimizing total semitone movement with a gentle
      pull toward the center of the keyboard. Deterministic.
- [x] **Bass toggle**: optionally double the root in the low octave (C2 range) under
      every chord — instant "demo-ready" low end.

## Phase 3 — Producer intelligence (dialog.html)

- [x] **Preset progression library** (~25 entries, grouped by genre): Pop (Axis,
      Doo-Wop, Pachelbel, Sensitive vi–IV–I–V, Royal Road, Creep), EDM/House,
      Neo-Soul/R&B (ii9–V13–Imaj9 cycles), Gospel walk-up, Lo-fi, Jazz (ii–V–I,
      Rhythm Changes, minor ii–V–i), Trap/Dark, Andalusian, Epic Minor, 12-bar Blues.
      One click = transposed into the current key, colors and bar-lengths included.
- [x] **Next-chord suggestions**: a per-mode transition table ranks what usually
      follows the previous slot's chord; suggested chords get a ★ badge in the
      palette plus a "Try: …" hint line. Answers "what comes next?" instantly.
- [x] **🎲 Surprise me**: weighted random-walk generator (mostly diatonic, tasteful
      borrowed-chord seasoning) that fills 4 slots following the suggestion graph.

## Phase 4 — Rhythm & write engine

- [x] **Per-slot length**: ½ / 1 / 2 bars (harmonic rhythm control — the difference
      between a ballad and a pop record).
- [x] **Performance patterns** applied on preview *and* write: Held, Pad (legato
      overlap), Stabs, 8th Pulse, Pushed (anticipated attacks), Arp Up, Arp Down,
      Strum (rolled). No more robotic whole notes.
- [x] **Humanize toggle**: velocity jitter + micro-timing stagger so written clips
      breathe like a player.
- [x] **Velocity control** (global slider).
- [x] **Write contract v2**: the webview now sends the final note list
      (`{ clipName, lengthBeats, notes: [{pitch,startTime,duration,velocity}] }`);
      the extension just writes it. All musical intelligence lives client-side.
- [x] **Never-fail write**: if no empty session slot exists, the extension creates a
      new scene and writes there instead of erroring.
- [x] **Loop-ready clip**: written clip is set to loop; one undo step via transaction.
- [x] **Tempo-synced preview**: Play button schedules the same event list the writer
      uses, at the Live Set's tempo, with a Loop toggle and proper Stop. What you
      hear is what gets written.

## Phase 5 — UX & ergonomics

- [x] **Drag-to-reorder slots** + per-slot duplicate (⧉) button.
- [x] **Keyboard shortcuts**: 1–7 fill the selected slot with that scale degree,
      ←/→ move selection, Backspace clears, Space plays/stops.
- [x] **"♪ from Live" key badge** when the session's scale is detected.
- [x] Dialog resized to 980×660; header reorganized (key/mode/sound + presets row).
- [x] Slot cards show colored chord name, roman numeral, bar length and voicing strip.

## Phase 6 — Build, docs, verification

- [x] Verify tonal type tokens used by new tables (`mMaj7`, `maj7#5`) resolve.
- [x] `npm run build` passes (tsc --noEmit + esbuild).
- [x] Update `CLAUDE.md` (modes, write contract v2, color layer, scene fallback).
- [x] Update `documentation/architecture.md` to match.

---

## Explicitly out of scope (and why)

- **Real-time MIDI input / play-to-audition through Live** — Extensions are offline
  editors; the SDK has no MIDI stream access. (That's Max for Live territory.)
- **Writing to the Arrangement** — Session view is the right target for idea
  generation; arrangement write can be a future toggle.
- **Separate bass/melody companion tracks** — the in-clip bass toggle covers 80% of
  the value without multiplying write paths.
