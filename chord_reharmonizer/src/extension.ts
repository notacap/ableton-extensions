import {
  initialize,
  Clip,
  MidiClip,
  MidiTrack,
  type ActivationContext,
  type Handle,
} from "@ableton-extensions/sdk";
import { Scale, Note, Chord } from "tonal";
import dialogHtml from "./dialog.html";

// ─────────────────────────────────────────────────────────────────────────────
// Chord Reharmonizer
//
// A sibling to Chord Progression Builder. Instead of writing a NEW looped
// progression, this acts on an EXISTING MIDI clip: right-click a clip, the
// extension reads its notes, segments them into chord blocks, and bakes that
// analysis (plus the Live Set's key and the full diatonic/borrowed palette)
// into a webview. The user selects a section of the progression — by clicking
// detected chord blocks or dragging a time range — then adds a turnaround,
// chromatic approach, or passing chords. The webview renders the rebuilt
// section as block-chord MIDI and posts it back.
//
// Each section edit works like a razor edit: original notes are SLICED at the
// selection boundaries — a chord that starts before the selection keeps its
// head, one that rings past it keeps its tail — and only the part inside the
// span is replaced. The webview performs those edits itself on its working
// copy of the notes ("Lock in" a section, pick the next, repeat), and posts
// back the COMPLETE final note list. Two destinations: "replace" rewrites the
// source clip in place (one undo step; works for session AND arrangement
// clips), "new" leaves the original untouched and writes the result to a
// fresh session clip.
//
// As in CPB, all editing happens in the webview with no round-trips; the
// extension only (1) analyzes + snapshots at open time, and (2) writes the
// final notes on "Drop it in".
// ─────────────────────────────────────────────────────────────────────────────

// A single pickable chord, with its Close (root-position) voicing precomputed.
interface ChordInfo {
  name: string;      // e.g. "Cmaj7"
  rootName: string;  // pitch class of the chord root, e.g. "C"
  roman: string;     // e.g. "Imaj7"
  notes: string;     // space-joined pitch classes, e.g. "C E G B"
  type: string;      // tonal chord-type token, e.g. "maj7"
  seventh: boolean;  // true for 4-note 7th chords
  midiNotes: number[]; // Close voicing, centered around C3–C5
}

interface PaletteEntry {
  diatonic: ChordInfo[]; // always 7
  borrowed: ChordInfo[]; // curated per mode
  noteNames: string[];   // 12 display names spelled the way this key prefers (♯ or ♭)
}

// ── Modes ────────────────────────────────────────────────────────────────────
const MODES = [
  "Major",
  "Minor",
  "Dorian",
  "Mixolydian",
  "Lydian",
  "Phrygian",
  "Harmonic Minor",
  "Melodic Minor",
] as const;
type Mode = (typeof MODES)[number];

const SCALE_NAME: Record<Mode, string> = {
  Major: "major",
  Minor: "minor",
  Dorian: "dorian",
  Mixolydian: "mixolydian",
  Lydian: "lydian",
  Phrygian: "phrygian",
  "Harmonic Minor": "harmonic minor",
  "Melodic Minor": "melodic minor",
};

const DIATONIC_TYPES: Record<Mode, string[]> = {
  Major:            ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"],
  Minor:            ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"],
  Dorian:           ["m7", "m7", "maj7", "7", "m7", "m7b5", "maj7"],
  Mixolydian:       ["7", "m7", "m7b5", "maj7", "m7", "m7", "maj7"],
  Lydian:           ["maj7", "7", "m7", "m7b5", "maj7", "m7", "m7"],
  Phrygian:         ["m7", "maj7", "7", "m7", "m7b5", "maj7", "m7"],
  "Harmonic Minor": ["mMaj7", "m7b5", "maj7#5", "m7", "7", "maj7", "dim7"],
  "Melodic Minor":  ["mMaj7", "m7", "maj7#5", "7", "7", "m7b5", "m7b5"],
};

const DIATONIC_ROMAN: Record<Mode, string[]> = {
  Major:            ["Imaj7", "iim7", "iiim7", "IVmaj7", "V7", "vim7", "viiø7"],
  Minor:            ["im7", "iiø7", "♭IIImaj7", "ivm7", "vm7", "♭VImaj7", "♭VII7"],
  Dorian:           ["im7", "iim7", "♭IIImaj7", "IV7", "vm7", "viø7", "♭VIImaj7"],
  Mixolydian:       ["I7", "iim7", "iiiø7", "IVmaj7", "vm7", "vim7", "♭VIImaj7"],
  Lydian:           ["Imaj7", "II7", "iiim7", "♯ivø7", "Vmaj7", "vim7", "viim7"],
  Phrygian:         ["im7", "♭IImaj7", "♭III7", "ivm7", "vø7", "♭VImaj7", "♭viim7"],
  "Harmonic Minor": ["imM7", "iiø7", "♭III+maj7", "ivm7", "V7", "♭VImaj7", "vii°7"],
  "Melodic Minor":  ["imM7", "iim7", "♭III+maj7", "IV7", "V7", "viø7", "viiø7"],
};

interface BorrowedDef {
  semitones: number;
  type: string;
  roman: string;
}

const BORROWED: Record<Mode, BorrowedDef[]> = {
  Major: [
    { semitones: 5,  type: "m7",   roman: "ivm7" },
    { semitones: 3,  type: "maj7", roman: "♭IIImaj7" },
    { semitones: 8,  type: "maj7", roman: "♭VImaj7" },
    { semitones: 10, type: "7",    roman: "♭VII7" },
    { semitones: 2,  type: "m7b5", roman: "iiø7" },
    { semitones: 2,  type: "7",    roman: "V7/V" },
    { semitones: 4,  type: "7",    roman: "V7/vi" },
    { semitones: 9,  type: "7",    roman: "V7/ii" },
    { semitones: 0,  type: "7",    roman: "V7/IV" },
    { semitones: 1,  type: "7",    roman: "♭II7" },
    { semitones: 1,  type: "maj7", roman: "♭IImaj7" },
    { semitones: 1,  type: "dim7", roman: "♯i°7" },
    { semitones: 6,  type: "dim7", roman: "♯iv°7" },
  ],
  Minor: [
    { semitones: 7,  type: "7",    roman: "V7" },
    { semitones: 1,  type: "maj7", roman: "♭IImaj7" },
    { semitones: 5,  type: "maj7", roman: "IVmaj7" },
    { semitones: 11, type: "dim7", roman: "vii°7" },
    { semitones: 0,  type: "maj",  roman: "Imaj" },
    { semitones: 0,  type: "7",    roman: "V7/iv" },
    { semitones: 1,  type: "7",    roman: "♭II7" },
    { semitones: 5,  type: "7",    roman: "IV7" },
    { semitones: 8,  type: "7",    roman: "♭VI7" },
  ],
  Dorian: [
    { semitones: 8,  type: "maj7", roman: "♭VImaj7" },
    { semitones: 7,  type: "7",    roman: "V7" },
    { semitones: 1,  type: "maj7", roman: "♭IImaj7" },
    { semitones: 10, type: "7",    roman: "♭VII7" },
    { semitones: 0,  type: "maj",  roman: "Imaj" },
  ],
  Mixolydian: [
    { semitones: 7,  type: "7",    roman: "V7" },
    { semitones: 5,  type: "7",    roman: "IV7" },
    { semitones: 10, type: "7",    roman: "♭VII7" },
    { semitones: 5,  type: "m7",   roman: "ivm7" },
    { semitones: 8,  type: "maj7", roman: "♭VImaj7" },
  ],
  Lydian: [
    { semitones: 7,  type: "7",    roman: "V7" },
    { semitones: 5,  type: "maj7", roman: "IVmaj7" },
    { semitones: 2,  type: "m7",   roman: "iim7" },
  ],
  Phrygian: [
    { semitones: 0,  type: "7",    roman: "I7" },
    { semitones: 7,  type: "7",    roman: "V7" },
    { semitones: 1,  type: "7",    roman: "♭II7" },
  ],
  "Harmonic Minor": [
    { semitones: 0,  type: "m7",   roman: "im7" },
    { semitones: 10, type: "7",    roman: "♭VII7" },
    { semitones: 7,  type: "m7",   roman: "vm7" },
    { semitones: 1,  type: "maj7", roman: "♭IImaj7" },
  ],
  "Melodic Minor": [
    { semitones: 0,  type: "m7",   roman: "im7" },
    { semitones: 8,  type: "maj7", roman: "♭VImaj7" },
    { semitones: 10, type: "7",    roman: "♭VII7" },
    { semitones: 1,  type: "maj7", roman: "♭IImaj7" },
  ],
};

// All 12 roots. Index == Live's `song.rootNote` (0 = C … 11 = B).
// These are stable KEYS into the palette map — display spelling is decided
// per key by `keyUsesSharps` below, never by this array.
const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ── Enharmonic spelling ──────────────────────────────────────────────────────
// Every name shown to the user is spelled from one of these two arrays, chosen
// per key, so the detected progression, the palette, and the technique chips
// all agree (E♭maj7 in flat keys, C♯m7 in sharp keys — never a mix).
const NOTE_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const toDisplay = (n: string) => n.replace("#", "♯").replace("b", "♭");

function accidentalCount(tonic: string, mode: Mode): number {
  const notes = Scale.get(`${tonic} ${SCALE_NAME[mode]}`).notes ?? [];
  return notes.join("").replace(/[A-G]/g, "").length; // # and b each count 1, ## counts 2
}

/**
 * Does this key spell better with sharps or flats? Black-key tonics compare
 * both spellings of the scale and keep the simpler one (E♭ major's 3 flats
 * beat D♯ major's double-sharps; ties go to flats, so G♭ over F♯). Natural
 * tonics look at which accidental the scale itself contains (A major → sharps,
 * F major → flats, C major → flats by default for borrowed chords).
 */
function keyUsesSharps(chroma: number, mode: Mode): boolean {
  const sharpTonic = NOTE_SHARP[chroma];
  const flatTonic = NOTE_FLAT[chroma];
  if (sharpTonic === flatTonic) {
    const s = (Scale.get(`${sharpTonic} ${SCALE_NAME[mode]}`).notes ?? []).join("");
    return (s.match(/#/g) ?? []).length > (s.match(/b/g) ?? []).length;
  }
  return accidentalCount(sharpTonic, mode) < accidentalCount(flatTonic, mode);
}

// For CHROMATIC roots (outside the key's scale), an explicit accidental in the
// roman numeral steers the spelling: ♯iv°7 is F♯°7 even in flat-leaning C
// major, ♭II7 is B♭7 even in sharp keys. First accidental in the string
// decides (so ♯IVm7♭5 still reads as sharp). In-scale roots never get here —
// they always use the key's own spelling (♭VII in G♯ minor is F♯, not G♭).
function spellingFor(roman: string, keyNames: string[]): string[] {
  const si = roman.indexOf("♯");
  const fi = roman.indexOf("♭");
  if (si >= 0 && (fi < 0 || si < fi)) return NOTE_SHARP;
  if (fi >= 0) return NOTE_FLAT;
  return keyNames;
}

const LIVE_SCALE_TO_MODE: Record<string, Mode> = {
  Major: "Major",
  Minor: "Minor",
  Dorian: "Dorian",
  Mixolydian: "Mixolydian",
  Lydian: "Lydian",
  Phrygian: "Phrygian",
  "Harmonic Minor": "Harmonic Minor",
  "Melodic Minor": "Melodic Minor",
};

// ── Voicing ──────────────────────────────────────────────────────────────────
const SEVENTH_TYPES = new Set(["maj7", "m7", "7", "m7b5", "dim7", "mMaj7", "maj7#5"]);

/**
 * Build a Close (root-position) voicing for `root + type`, centered around
 * C3–C5. Anchors the root into [F#3..F4] (MIDI 54–65), then stacks each higher
 * chord tone to the nearest pitch above the previous one. Deterministic.
 */
function closeVoicing(root: string, type: string): number[] {
  const chord = Chord.get(root + type);
  const pcs = (chord.notes ?? []).map((n) => Note.chroma(n) ?? 0);
  if (pcs.length === 0) return [60];

  const rootChroma = pcs[0];
  const folded = ((rootChroma + 6) % 12) - 6;
  let prev = 60 + folded;
  const midi = [prev];

  for (let i = 1; i < pcs.length; i++) {
    let step = (pcs[i] - (prev % 12) + 12) % 12;
    if (step === 0) step = 12;
    prev = prev + step;
    midi.push(prev);
  }
  return midi;
}

// Display suffixes matching the webview's TYPE_SUFFIX, so palette names are
// formatted identically to the names the webview builds itself.
const TYPE_DISPLAY: Record<string, string> = {
  maj7: "maj7", m7: "m7", "7": "7", m7b5: "m7♭5", dim7: "°7",
  mMaj7: "mMaj7", "maj7#5": "maj7♯5", maj: "", m: "m",
};

function makeChordInfo(
  chroma: number,
  type: string,
  roman: string,
  keyNames: string[],
  scaleChromas: Set<number>,
): ChordInfo {
  const c = ((chroma % 12) + 12) % 12;
  const arr = scaleChromas.has(c) ? keyNames : spellingFor(roman, keyNames);
  const root = arr[c];
  const tones = (Chord.get(root + type).notes ?? [])
    .map((n) => toDisplay(arr[Note.chroma(n) ?? 0]));
  return {
    name: toDisplay(root) + (TYPE_DISPLAY[type] ?? type),
    rootName: toDisplay(root),
    roman,
    notes: tones.join(" "),
    type,
    seventh: SEVENTH_TYPES.has(type),
    midiNotes: closeVoicing(root, type),
  };
}

function buildDiatonic(
  chroma: number, mode: Mode, keyNames: string[], scaleChromas: Set<number>,
): ChordInfo[] {
  const scale = Scale.get(`${keyNames[chroma]} ${SCALE_NAME[mode]}`).notes;
  if (!scale || scale.length < 7) return [];
  return scale.slice(0, 7).map((note, i) =>
    makeChordInfo(Note.chroma(note) ?? 0, DIATONIC_TYPES[mode][i], DIATONIC_ROMAN[mode][i], keyNames, scaleChromas),
  );
}

function buildBorrowed(
  chroma: number, mode: Mode, keyNames: string[], scaleChromas: Set<number>,
): ChordInfo[] {
  return BORROWED[mode].map((b) =>
    makeChordInfo((chroma + b.semitones) % 12, b.type, b.roman, keyNames, scaleChromas),
  );
}

// ── Clip note types ──────────────────────────────────────────────────────────
interface ClipNote {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
}

// ── Activation ───────────────────────────────────────────────────────────────
export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  // Precompute the palette for every root × mode at startup.
  const palette: Record<string, PaletteEntry> = {};
  for (const mode of MODES) {
    ROOTS.forEach((root, chroma) => {
      const keyNames = keyUsesSharps(chroma, mode) ? NOTE_SHARP : NOTE_FLAT;
      const scaleChromas = new Set(
        (Scale.get(`${keyNames[chroma]} ${SCALE_NAME[mode]}`).notes ?? [])
          .map((n) => Note.chroma(n) ?? 0),
      );
      palette[`${mode}|${root}`] = {
        diatonic: buildDiatonic(chroma, mode, keyNames, scaleChromas),
        borrowed: buildBorrowed(chroma, mode, keyNames, scaleChromas),
        noteNames: keyNames.map(toDisplay),
      };
    });
  }

  context.commands.registerCommand("crh.open", async (arg: unknown) => {
    const handle = arg as Handle;
    const resolved = context.getObjectFromHandle(handle, Clip);
    if (!(resolved instanceof MidiClip)) {
      console.warn("[CRH] Not a MIDI clip — reharmonization needs MIDI.");
      return;
    }
    const clip = resolved;

    // Snapshot the clip's notes + loop bounds, and the Live Set's key/tempo.
    const rawNotes = clip.notes ?? [];
    const notes: ClipNote[] = rawNotes
      .filter((n) => Number.isFinite(n.pitch) && Number.isFinite(n.startTime) && n.duration > 0)
      .map((n) => ({
        pitch: Math.round(n.pitch),
        startTime: n.startTime,
        duration: n.duration,
        velocity: Math.round(n.velocity ?? 96),
      }))
      .sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);

    if (notes.length === 0) {
      console.warn("[CRH] Clip has no notes to reharmonize.");
      return;
    }

    // Loop bounds drive the bar grid; fall back to content extent.
    const contentEnd = notes.reduce((m, n) => Math.max(m, n.startTime + n.duration), 0);
    let loopStart = 0;
    let loopEnd = contentEnd;
    try {
      if (Number.isFinite(clip.loopStart)) loopStart = clip.loopStart;
      if (Number.isFinite(clip.loopEnd) && clip.loopEnd > loopStart) loopEnd = clip.loopEnd;
    } catch (err) {
      console.warn("[CRH] Could not read loop bounds; using content extent.", err);
    }
    if (!(loopEnd > loopStart)) loopEnd = loopStart + Math.max(contentEnd, 4);

    const song = context.application.song;
    let live: {
      tempo: number;
      rootIndex: number;
      mode: Mode | null;
      scaleName: string;
      scaleMode: boolean;
    } = { tempo: 120, rootIndex: 0, mode: null, scaleName: "", scaleMode: false };
    try {
      const scaleName = song.scaleName;
      live = {
        tempo: song.tempo,
        rootIndex: song.rootNote,
        mode: LIVE_SCALE_TO_MODE[scaleName] ?? null,
        scaleName,
        scaleMode: song.scaleMode,
      };
    } catch (err) {
      console.warn("[CRH] Could not read song scale/tempo:", err);
    }

    let clipName = "Clip";
    try { clipName = clip.name || "Clip"; } catch {}

    const allData = {
      roots: ROOTS,
      modes: MODES,
      palette,
      live,
      clip: { name: clipName, notes, loopStart, loopEnd },
    };

    const html = dialogHtml.replace("/*__DATA__*/null", JSON.stringify(allData));

    let resultJson: string;
    try {
      resultJson = await context.ui.showModalDialog(
        `data:text/html,${encodeURIComponent(html)}`,
        1040,
        700,
      );
    } catch (err) {
      console.log("[CRH] Dialog closed without applying:", err);
      return;
    }

    let result: {
      action: string;
      target?: string; // "replace" (default) | "new"
      notes: ClipNote[]; // the COMPLETE final note list for the clip
      loopEnd?: number; // dialog's final loop end — grows when the user hits ⧉ ×2 loop
    };
    try {
      result = JSON.parse(resultJson);
    } catch {
      return;
    }
    if (result.action !== "apply") return;
    if (!Array.isArray(result.notes)) return;

    await writeReharmonizedClip(context, handle, result);
  });

  context.ui.registerContextMenuAction(
    "MidiClip",
    "Reharmonize Section…",
    "crh.open",
  );
}

// ── Apply the rewrite ─────────────────────────────────────────────────────────
// The webview did all the razor-edit slicing on its working copy (possibly
// across several locked-in sections) and sends the complete final note list;
// here we just sanitize it and write it.
//
//   target "replace" (default) — rewrite the source clip's notes in place as
//                                one undo step; works for session AND
//                                arrangement clips.
//   target "new"               — leave the original untouched and write the
//                                result to the first empty session slot on
//                                the same track (appending a scene if full).
async function writeReharmonizedClip(
  context: ReturnType<typeof initialize>,
  handle: Handle,
  result: { target?: string; notes: ClipNote[]; loopEnd?: number },
): Promise<void> {
  // Re-resolve from the handle (the object may be stale after the modal await).
  const resolved = context.getObjectFromHandle(handle, Clip);
  if (!(resolved instanceof MidiClip)) {
    console.error("[CRH] Clip no longer resolves to a MIDI clip.");
    return;
  }
  const sourceClip = resolved;

  // Sanitize the final note list. Empty = the user chose to clear everything.
  const merged = (result.notes ?? [])
    .filter((n) => Number.isFinite(n.pitch) && Number.isFinite(n.startTime) && n.duration > 0)
    .map((n) => ({
      pitch: Math.max(0, Math.min(127, Math.round(n.pitch))),
      startTime: Math.max(0, n.startTime),
      duration: n.duration,
      velocity: Math.max(1, Math.min(127, Math.round(n.velocity ?? 96))),
    }))
    .sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);

  // Did ⧉ ×2 loop grow the loop? (A normal apply posts the unchanged loop end.)
  const newLoopEnd = Number(result.loopEnd);
  let curLoopEnd = NaN;
  let curLoopStart = 0;
  try { curLoopEnd = sourceClip.loopEnd; } catch {}
  try { if (Number.isFinite(sourceClip.loopStart)) curLoopStart = sourceClip.loopStart; } catch {}
  const loopGrew =
    Number.isFinite(newLoopEnd) &&
    Number.isFinite(curLoopEnd) &&
    newLoopEnd > curLoopEnd + 1e-6;

  const song = context.application.song;

  // ── In-place rewrite (default) — one undo step, original loop untouched ──
  if (result.target !== "new" && !loopGrew) {
    context.withinTransaction(() => {
      sourceClip.notes = merged;
    });
    console.log(`[CRH] Rewrote clip in place — ${merged.length} notes.`);
    return;
  }

  // ── "Into this clip" with a doubled loop ──
  // Clip loop bounds are read-only in this SDK, so the only way to honor the
  // new length is to rebuild the clip in its session slot (name and color
  // carried over; settings like envelopes/follow actions don't survive).
  if (result.target !== "new") {
    let slot;
    for (const t of song.tracks) {
      if (!(t instanceof MidiTrack)) continue;
      slot = (t as MidiTrack<"1.0.0">).clipSlots.find(
        (s) => s.clip && s.clip.handle.id === handle.id,
      );
      if (slot) break;
    }
    if (slot && curLoopStart < 1e-6) {
      let name = "Clip";
      let color: number | undefined;
      try { name = sourceClip.name || "Clip"; } catch {}
      try { color = sourceClip.color; } catch {}
      const contentEnd = merged.reduce((m, n) => Math.max(m, n.startTime + n.duration), 0);
      const lengthBeats = Math.max(newLoopEnd, contentEnd, 1);
      await slot.deleteClip();
      const newClip = await slot.createMidiClip(lengthBeats);
      context.withinTransaction(() => {
        newClip.name = name;
        if (color !== undefined) newClip.color = color;
        newClip.notes = merged;
        newClip.looping = true;
      });
      console.log(
        `[CRH] Rebuilt "${name}" at ${lengthBeats} beats (loop doubled) — ${merged.length} notes.`,
      );
      return;
    }
    // Arrangement clip (or a loop that doesn't start at 0): rebuilding in
    // place isn't safe, so leave the original untouched and let the doubled
    // version land in a fresh session clip below.
    console.warn(
      "[CRH] Can't extend this clip's loop in place — writing the doubled progression as a new clip instead.",
    );
  }

  // ── New-clip path — original untouched ──
  // Clip length: preserve the original loop length, but never clip a note.
  let sourceName = "Clip";
  let loopEnd = 0;
  try { sourceName = sourceClip.name || "Clip"; } catch {}
  try { if (Number.isFinite(sourceClip.loopEnd)) loopEnd = sourceClip.loopEnd; } catch {}
  if (Number.isFinite(Number(result.loopEnd))) loopEnd = Math.max(loopEnd, Number(result.loopEnd));
  const contentEnd = merged.reduce((m, n) => Math.max(m, n.startTime + n.duration), 0);
  const lengthBeats = Math.max(loopEnd, contentEnd, 1);

  // Find the track that owns the source clip (session slot OR arrangement),
  // then the first empty session slot on it.
  const findTrack = () => {
    for (const t of song.tracks) {
      if (!(t instanceof MidiTrack)) continue;
      const mt = t as MidiTrack<"1.0.0">;
      if (mt.clipSlots.some((s) => s.clip && s.clip.handle.id === handle.id)) return mt;
      try {
        if (mt.arrangementClips.some((c) => c.handle.id === handle.id)) return mt;
      } catch {}
    }
    return undefined;
  };

  let track = findTrack();
  if (!track) {
    console.error("[CRH] Could not locate the track for this clip.");
    return;
  }
  let emptySlot = track.clipSlots.find((s) => !s.clip);
  if (!emptySlot) {
    console.log("[CRH] No empty clip slot — creating a new scene.");
    await song.createScene(-1);
    track = findTrack();
    emptySlot = track?.clipSlots.find((s) => !s.clip);
  }
  if (!track || !emptySlot) {
    console.error("[CRH] No empty clip slot available on this track.");
    return;
  }

  const newClip = await emptySlot.createMidiClip(lengthBeats);
  context.withinTransaction(() => {
    newClip.name = `${sourceName} (reharm)`;
    newClip.notes = merged;
    newClip.looping = true;
  });

  console.log(
    `[CRH] Wrote "${newClip.name}" — ${merged.length} notes over ${lengthBeats} beats.`,
  );
}
