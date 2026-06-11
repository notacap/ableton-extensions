You are building an Ableton Live 12.4.5 Extension in TypeScript called
"Chord Progression Builder". It uses the @ableton-extensions/sdk (1.0.0-beta.0,
vendored as ./vendor/ableton-extensions-sdk-1.0.0-beta.0.tgz) and the
@ableton-extensions/cli (./vendor/ableton-extensions-cli-1.0.0-beta.0.tgz), plus
the `tonal` npm package for music theory. Node >= 22.11, bundled with esbuild.

REFERENCE: Clone github.com/federico-pepe/ableton-live-extensions (MIT licensed).
Study extensions/chord-progression-helper. REUSE its proven plumbing verbatim:
manifest.json shape, build.ts (esbuild config with the ".html": "text" loader),
tsconfig.json, src/html.d.ts, the `closeWithResult` postMessage contract, the
`playNote_piano` / `playNote_ep` / `playNote_synth` Web Audio functions, and the
`writeProgressionToTrack` MIDI-writing pattern. DO NOT copy its grid-based UI —
build the slot-based UI described below instead.

VERIFIED SDK CONTRACT (build exactly against this, do not invent APIs):
- Entry: `export function activate(activation: ActivationContext)`, then
  `const context = initialize(activation, "1.0.0")`.
- `context.commands.registerCommand("cpb.open", async (arg) => {...})`
- `context.ui.registerContextMenuAction("MidiTrack", "Build Chord Progression…", "cpb.open")`
- `const track = context.getObjectFromHandle(arg as Handle, MidiTrack)`
- `const resultJson = await context.ui.showModalDialog(`data:text/html,${encodeURIComponent(html)}`, 920, 600)`
- Bake precomputed data into the HTML by string-replacing `/*__DATA__*/null` with JSON.
- Webview returns via postMessage: { method: "close_and_send", params: [JSON.stringify(data)] }
  using window.webkit.messageHandlers.live (macOS) or window.chrome.webview (Windows).
- MIDI: song.tracks.find by handle.id -> clipSlots.find(s=>!s.clip) ->
  await slot.createMidiClip(beats); clip.name = ...; clip.notes = [{pitch,startTime,duration,velocity}].

FEATURE SPEC:
1. Key/mode selector. Modes: Major, Minor (natural), Dorian. Use tonal's
   Scale.get(`${root} ${mode}`) and Chord/Note/Interval to build chords. All 12 roots.
2. Diatonic chord qualities:
   - Major:  I maj7, ii m7, iii m7, IV maj7, V7, vi m7, vii m7b5
   - Minor:  i m7, ii m7b5, bIII maj7, iv m7, v m7, bVI maj7, bVII7
   - Dorian: i m7, ii m7, bIII maj7, IV7, v m7, vi m7b5, bVII maj7
3. Borrowed chords (curated, hardcoded per mode; shown in an expandable "More"
   section under the diatonic row):
   - Major:  iv m7, bIII maj7, bVI maj7, bVII7, ii m7b5, V7/V, V7/vi, bII maj7 (Neapolitan)
   - Minor:  V7 (harmonic-minor dominant), bII maj7 (Neapolitan), IV maj7 (Dorian-b6/natural-6 color),
             vii dim7, I maj (Picardy), V7/iv
   - Dorian: bVI maj7, V7 (harmonic), bII maj7
4. Slot-based UI:
   - A row of chord slots. "+ Add slot" appends an empty slot. "x" removes a slot.
   - Click a slot to select it; the chord palette becomes that slot's picker.
   - Clicking a chord fills the selected slot and IMMEDIATELY previews it (audio).
   - A filled slot shows chord name + roman numeral and a voicing strip.
5. Voicing options per chord (deterministic transforms on the chord-tone MIDI array,
   centered around C3-C5). Clicking one updates the slot's midiNotes and previews again:
   - Close (root position), 1st inversion, 2nd inversion, Open/spread (drop-2),
     Rootless (7th/9th chords only), Shell (root+3rd+7th, 7th chords only).
   - New slots default to Close.
6. Audio preview = Web Audio in the webview (copy playNote_* from reference).
   Include an instrument selector (piano/EP/synth) and a "Play progression" button
   that plays filled slots in sequence (~600ms apart). Create AudioContext lazily
   on first gesture and resume() it.
7. OPTIONAL global "Smooth voice-leading" toggle (default OFF): when ON, before
   previewing/writing the whole progression, pick each slot's inversion/octave to
   minimize total semitone movement from the previous slot.
8. "Write to Live" button posts { action: "write", progression: [{name, roman, voicing, midiNotes}] }.
9. MIDI write: 1 bar (4 beats) per filled slot. createMidiClip(N*4). For slot i,
   each pitch -> {pitch, startTime: i*4, duration: 3.95, velocity: 80}. Clip name =
   chord names joined by " - ". If no empty clip slot exists, log/surface a clear message.

UI STYLE: dark theme matching Live (bg ~#1c1c1c, surfaces ~#272727, accent orange
~#FFA500, blue ~#7aacf5 for diatonic, purple for borrowed). 920x600. Clean,
uncluttered: diatonic chords prominent, borrowed chords behind a "More" toggle.

DELIVERABLES: complete project (manifest.json, package.json, build.ts, tsconfig.json,
src/extension.ts, src/dialog.html, src/html.d.ts). Make `npm run start` and
`npm run package` work. Keep all editing logic in the webview (no round-trips to
the extension mid-edit). Comment the voicing-transform and theory code.
