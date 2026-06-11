chord-progression-builder/
├── manifest.json          # name, author, entry: "dist/extension.js", version, minimumApiVersion
├── package.json           # deps: @ableton-extensions/sdk, tonal ; dev: cli, esbuild, tsx, typescript
├── build.ts               # esbuild config (incl. the .html text loader)
├── tsconfig.json
└── src/
    ├── extension.ts       # activation, theory generation, Live context, MIDI write
    ├── dialog.html        # the entire UI: slots, colors, voicings, presets,
    │                      #   rhythm engine + Web Audio preview
    └── html.d.ts          # declare module "*.html"



Data flow (v2)

On activation, precompute the chord palette for every key/mode (diatonic +
borrowed) — 12 roots × 8 modes. When the user opens the dialog, snapshot the
Live Set's tempo and current scale (song.tempo / rootNote / scaleName /
scaleMode) and bake { roots, modes, palette, live } into dialog.html via the
/*__DATA__*/null placeholder (this literal must stay byte-identical on both
sides). The webview handles ALL interaction with zero round-trips: presets,
slot editing, chord colors, voicings, rhythm patterns, voice-leading, preview.

On "Write", the webview renders the final performance itself and posts
{ action: "write", clipName, lengthBeats, notes } where notes is a ready
NoteDescription list ({ pitch, startTime, duration, velocity } in beats).
extension.ts validates/clamps it and writes one looped MIDI clip — it stays a
dumb writer; all musical intelligence is client-side.

Modes (8)

Major, Minor (natural), Dorian, Mixolydian, Lydian, Phrygian, Harmonic Minor,
Melodic Minor. Scale notes via Scale.get(`${root} ${scale}`); diatonic 7th
chord qualities and roman numerals are hardcoded per mode in DIATONIC_TYPES /
DIATONIC_ROMAN. Harmonic/Melodic minor introduce the mMaj7 and maj7#5 types.

Chord palette per key

Primary row: the 7 diatonic chords (always visible).
Borrowed/spice (expandable "More" section): a curated, hardcoded set per mode —
modal mixture, secondary dominants (V7/ii, V7/IV, V7/V, V7/vi), tritone sub
(♭II7), passing diminisheds (♯i°7, ♯iv°7), Neapolitan, Picardy, blues
dominants. See the BORROWED table in extension.ts.

Each ChordInfo bakes: name, rootName, roman, notes, type, seventh, and a
deterministic Close-position midiNotes array whose root is anchored into
F#3..F4 (MIDI 54–65) so every key sits around C3–C5.

Color layer (webview)

Per-slot "colors" extend the base chord without touching the extension:
a static CHORD_COLORS table maps each chord type to interval sets from the
root (Triad / 7th / 9th / 11th / 13th / 6 / 6-9 / sus2 / sus4 / 7♭9 / 7♯9 /
maj7♯11 where idiomatic). Display name = rootName + suffix (Am7 → Am11).
Default color: 7th for seventh chords, Triad otherwise.

Slot interaction (the core UX)

A horizontal row of slots; ＋ Add slot appends, ✕ removes, ⧉ duplicates,
drag reorders. Click a slot to select it → the palette becomes that slot's
picker, with ★ next-chord suggestions ranked from the previous slot's chord
(per-mode transition tables in SUGGEST). Clicking a chord fills the slot and
immediately previews it. Per-slot controls: Color chips, Voicing chips, and
Length (½ / 1 / 2 bars). Keyboard: 1–7 fill the selected slot with that
degree, ←/→ navigate, Backspace clears, Space plays/stops.

Presets & dice

PRESETS (~25, grouped by genre) reference chords by roman label and are
resolved against the current key's palette — loading one transposes it into
the session key, including colors and bar lengths. The 🎲 generator random-
walks the suggestion graph (mostly diatonic, occasional borrowed spice).
Changing key/mode re-resolves every filled slot by roman = transposes the
whole progression.

Voicing options (deterministic transforms on the colored note set)

Close, 1st/2nd inversion, Open (drop-2), Drop-3, Wide (root −12), Rootless,
Shell (root+3rd+7th). Rootless/Shell require a 7th in the *colored* set;
Drop-3 requires ≥4 notes. Default Close.

Auto voice-leading (global toggle): each chord after the first searches all
inversions × octave shifts for minimal semitone movement from the previous
chord with a gentle pull toward the keyboard center. Deterministic.

Performance engine

buildPerformance() turns the progression into one concrete event list used by
BOTH preview and write: per-slot length × global pattern (Held, Pad, Stabs,
8th Pulse, Pushed, Arp Up/Down, Strum), global velocity, optional Humanize
(velocity jitter + micro-timing), optional Bass root (held C2-range root).
Events never spill past the loop end.

Audio preview

Web Audio (piano / EP / synth), scheduled sample-accurately at the Live Set's
tempo via per-note gate nodes that respect event durations. ▶ Play toggles to
■ Stop; Loop re-schedules each pass (picking up live edits). AudioContext is
created lazily on first gesture and resume()d.

MIDI write

The extension re-resolves the track by handle.id, finds the first empty
session slot — creating a new scene (song.createScene(-1)) if none exists, so
the write never fails — then createMidiClip(lengthBeats), sets name/notes/
looping inside one transaction. Clip name = colored chord names joined by " – ".
