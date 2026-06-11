# UI / UX Improvement Plan — "The Music Never Stopped"

Design north star: the dialog should feel like a **playable instrument in a dimly-lit
studio**, not a configuration form. Color carries musical meaning, playback is always
visible and alive, and entering a progression should flow like tapping pads.

All changes live in `src/dialog.html` (CSS + client-side JS). No changes to the
extension boundary, the `/*__DATA__*/null` placeholder, or the write contract.

## 1. Theme & atmosphere — "studio at night"

- [x] Replace the monochrome glacier theme with a deep plum-black base, warm
      **lamp-gold** accent (the "commit/record" color) and **tape-teal** transport
      color — wider palette, warmer mood
- [x] Slow drifting aurora background (4 hue blobs — coral / violet / teal / magenta —
      on a 46s ease loop) so the room subtly breathes even when idle
- [x] Gradient ink title, pill-shaped chips and buttons, glassy translucent panels

## 2. Color carries harmony — circle-of-fifths hue wheel

- [x] Every chord (tile *and* slot card) is tinted by its **root pitch class mapped
      around the circle of fifths** → 12 hues, 30° apart. Related chords get related
      colors; a progression literally reads as a color story
- [x] Voice-strip mini-bars inherit the chord's hue
- [x] Borrowed/spice chords keep their hue but get a dashed border so they read as
      "outside the key" at a glance
- [x] Suggestion stars stay gold with a soft glow

## 3. Keep-the-music-going layer

- [x] **Now-playing highlight**: during playback the sounding slot pulses with its
      own hue glow and lifts — your eye follows the progression in time
- [x] **Playhead bar** under the slot row that sweeps across the loop in sync with
      the audio (restarts every loop pass)
- [x] **Loop defaults to ON** — auditioning keeps cycling while you tweak; edits are
      picked up on the next pass
- [x] Play button becomes a transport-style **Listen** pill that visibly switches
      into a lit "playing" state

## 4. Flow UX — tap-tap-tap entry

- [x] **Auto-advance**: placing a chord into an empty slot auto-selects the next
      slot (creating one at the end), so you can tap out a whole progression without
      touching the slot row — and the "try next" suggestions appear after every tap
- [x] Friendlier empty-slot and status copy ("pick a chord ↓", boot greeting)
- [x] Keyboard hints visible in the footer (1–7 chords · Space listen · ← → move · ⌫ clear)
- [x] Toolbar grouped into rounded "pods" (generate / feel / character) instead of a
      flat strip of controls
- [x] Chord tiles get a tactile hover-lift + press-down feel
- [x] Rename CTAs to musician language: "▶ Listen", "♪ Drop into Live"

## 5. Verify

- [x] `npm run build` (tsc + esbuild) passes
- [x] Placeholder `/*__DATA__*/null` and `postToHost` contract untouched
