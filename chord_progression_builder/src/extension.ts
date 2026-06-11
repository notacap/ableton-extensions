import {
  initialize,
  MidiTrack,
  type ActivationContext,
  type Handle,
} from "@ableton-extensions/sdk";
import { Scale, Note, Chord, Interval } from "tonal";
import dialogHtml from "./dialog.html";

// ─────────────────────────────────────────────────────────────────────────────
// Chord Progression Builder
//
// On activation we precompute the full chord palette (diatonic + curated
// borrowed chords) for every root × mode and bake it into the dialog HTML,
// together with the Live Set's tempo and current scale (read at open time).
// The webview then does ALL editing — slot picking, chord colors/extensions,
// voicing transforms, rhythm patterns, audio preview — with no round-trips
// back to the extension. When the user clicks "Write to Live" the webview
// posts a final, fully-rendered note list, and we write it as one looped MIDI
// clip into the first empty session slot on the track (creating a new scene
// if every slot is full).
// ─────────────────────────────────────────────────────────────────────────────

// A single pickable chord, with its Close (root-position) voicing precomputed.
interface ChordInfo {
  name: string;      // e.g. "Cmaj7"
  rootName: string;  // pitch class of the chord root, e.g. "C" (drives renaming
                     // when the webview's color layer extends the chord)
  roman: string;     // e.g. "Imaj7"
  notes: string;     // space-joined pitch classes, e.g. "C E G B"
  type: string;      // tonal chord-type token, e.g. "maj7" (drives colors/voicings)
  seventh: boolean;  // true for 4-note 7th chords (enables Rootless/Shell)
  midiNotes: number[]; // Close voicing, centered around C3–C5
}

interface PaletteEntry {
  diatonic: ChordInfo[]; // always 7
  borrowed: ChordInfo[]; // curated per mode
}

// ── Modes ────────────────────────────────────────────────────────────────────
// Map our modes to tonal scale names. Order = display order in the dialog.
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
  Minor: "minor", // natural minor (aeolian)
  Dorian: "dorian",
  Mixolydian: "mixolydian",
  Lydian: "lydian",
  Phrygian: "phrygian",
  "Harmonic Minor": "harmonic minor",
  "Melodic Minor": "melodic minor",
};

// Diatonic chord qualities per scale degree (tonal type tokens).
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

// Roman numerals shown on each diatonic chord (ø = half-diminished m7b5).
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

// Curated borrowed/spice chords per mode, defined as a semitone offset from
// the tonic plus a chord type and roman label: modal mixture, secondary
// dominants, tritone subs, gospel passing diminisheds, Neapolitan, Picardy.
interface BorrowedDef {
  semitones: number;
  type: string;
  roman: string;
}

const BORROWED: Record<Mode, BorrowedDef[]> = {
  Major: [
    { semitones: 5,  type: "m7",   roman: "ivm7" },        // minor four
    { semitones: 3,  type: "maj7", roman: "♭IIImaj7" },
    { semitones: 8,  type: "maj7", roman: "♭VImaj7" },
    { semitones: 10, type: "7",    roman: "♭VII7" },
    { semitones: 2,  type: "m7b5", roman: "iiø7" },         // borrowed ii half-dim
    { semitones: 2,  type: "7",    roman: "V7/V" },         // sec. dom of V (D7 in C)
    { semitones: 4,  type: "7",    roman: "V7/vi" },        // sec. dom of vi (E7 in C)
    { semitones: 9,  type: "7",    roman: "V7/ii" },        // sec. dom of ii (A7 in C)
    { semitones: 0,  type: "7",    roman: "V7/IV" },        // sec. dom of IV (C7 in C)
    { semitones: 1,  type: "7",    roman: "♭II7" },         // tritone sub of V
    { semitones: 1,  type: "maj7", roman: "♭IImaj7" },      // Neapolitan
    { semitones: 1,  type: "dim7", roman: "♯i°7" },         // passing dim (I → ii)
    { semitones: 6,  type: "dim7", roman: "♯iv°7" },        // gospel passing dim
  ],
  Minor: [
    { semitones: 7,  type: "7",    roman: "V7" },           // harmonic-minor dominant
    { semitones: 1,  type: "maj7", roman: "♭IImaj7" },      // Neapolitan
    { semitones: 5,  type: "maj7", roman: "IVmaj7" },       // Dorian ♮6 color
    { semitones: 11, type: "dim7", roman: "vii°7" },        // leading-tone dim7
    { semitones: 0,  type: "maj",  roman: "Imaj" },         // Picardy third
    { semitones: 0,  type: "7",    roman: "V7/iv" },        // sec. dom of iv (C7 in Am)
    { semitones: 1,  type: "7",    roman: "♭II7" },         // tritone sub of V
    { semitones: 5,  type: "7",    roman: "IV7" },          // blues/dorian four
    { semitones: 8,  type: "7",    roman: "♭VI7" },         // dark pre-dominant
  ],
  Dorian: [
    { semitones: 8,  type: "maj7", roman: "♭VImaj7" },      // Aeolian color
    { semitones: 7,  type: "7",    roman: "V7" },           // harmonic-minor dominant
    { semitones: 1,  type: "maj7", roman: "♭IImaj7" },      // Neapolitan
    { semitones: 10, type: "7",    roman: "♭VII7" },        // Aeolian dominant 7
    { semitones: 0,  type: "maj",  roman: "Imaj" },         // Picardy third
  ],
  Mixolydian: [
    { semitones: 7,  type: "7",    roman: "V7" },           // real dominant
    { semitones: 5,  type: "7",    roman: "IV7" },          // blues four
    { semitones: 10, type: "7",    roman: "♭VII7" },        // dominant ♭VII
    { semitones: 5,  type: "m7",   roman: "ivm7" },         // minor four
    { semitones: 8,  type: "maj7", roman: "♭VImaj7" },      // Aeolian color
  ],
  Lydian: [
    { semitones: 7,  type: "7",    roman: "V7" },           // tonal pull home
    { semitones: 5,  type: "maj7", roman: "IVmaj7" },       // natural four (Ionian)
    { semitones: 2,  type: "m7",   roman: "iim7" },         // natural ii (Ionian)
  ],
  Phrygian: [
    { semitones: 0,  type: "7",    roman: "I7" },           // phrygian-dominant tonic
    { semitones: 7,  type: "7",    roman: "V7" },           // harmonic dominant
    { semitones: 1,  type: "7",    roman: "♭II7" },         // flamenco dominant ♭II
  ],
  "Harmonic Minor": [
    { semitones: 0,  type: "m7",   roman: "im7" },          // natural-minor tonic 7
    { semitones: 10, type: "7",    roman: "♭VII7" },        // Aeolian dominant
    { semitones: 7,  type: "m7",   roman: "vm7" },          // natural-minor five
    { semitones: 1,  type: "maj7", roman: "♭IImaj7" },      // Neapolitan
  ],
  "Melodic Minor": [
    { semitones: 0,  type: "m7",   roman: "im7" },          // natural-minor tonic 7
    { semitones: 8,  type: "maj7", roman: "♭VImaj7" },      // Aeolian color
    { semitones: 10, type: "7",    roman: "♭VII7" },        // Aeolian dominant
    { semitones: 1,  type: "maj7", roman: "♭IImaj7" },      // Neapolitan
  ],
};

// All 12 roots (sharps; tonal normalizes enharmonics fine for our purposes).
// Index in this array == Live's `song.rootNote` (0 = C … 11 = B).
const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Live scale names (Current Scale Name chooser) that map onto our modes.
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
// Chord types we treat as "seventh chords" (4 tones) → enable Rootless / Shell.
const SEVENTH_TYPES = new Set(["maj7", "m7", "7", "m7b5", "dim7", "mMaj7", "maj7#5"]);

/**
 * Build a Close (root-position) voicing for `root + type`, centered around
 * C3–C5 regardless of key. We anchor the root into [F#3..F4] (MIDI 54–65) so
 * no chord sits too low or high, then stack each higher chord tone to the
 * nearest pitch above the previous one. Deterministic — same input, same array.
 */
function closeVoicing(root: string, type: string): number[] {
  const chord = Chord.get(root + type);
  const pcs = (chord.notes ?? []).map((n) => Note.chroma(n) ?? 0);
  if (pcs.length === 0) return [60];

  // Anchor the root chroma into [54, 65] (F#3..F4): map chroma 0..5 → 0..+5,
  // chroma 6..11 → -6..-1, so roots stay clustered around middle C.
  const rootChroma = pcs[0];
  const folded = ((rootChroma + 6) % 12) - 6; // → [-6, 5]; with +6 below → [55,66]
  let prev = 60 + folded;
  const midi = [prev];

  // Stack each remaining chord tone to the next-higher pitch of that class.
  for (let i = 1; i < pcs.length; i++) {
    let step = (pcs[i] - (prev % 12) + 12) % 12;
    if (step === 0) step = 12; // keep voices distinct / ascending
    prev = prev + step;
    midi.push(prev);
  }
  return midi;
}

function chordNoteNames(root: string, type: string): string {
  try {
    const c = Chord.get(root + type);
    if (c?.notes?.length) return c.notes.join(" ");
  } catch {}
  return "";
}

function makeChordInfo(root: string, type: string, roman: string): ChordInfo {
  // Prefer tonal's symbol for a clean display name; fall back to root+type.
  const sym = Chord.get(root + type).symbol;
  return {
    name: sym && sym.length ? sym : root + type,
    rootName: root,
    roman,
    notes: chordNoteNames(root, type),
    type,
    seventh: SEVENTH_TYPES.has(type),
    midiNotes: closeVoicing(root, type),
  };
}

/** Diatonic chords for a given root/mode, derived from the scale notes. */
function buildDiatonic(root: string, mode: Mode): ChordInfo[] {
  const scale = Scale.get(`${root} ${SCALE_NAME[mode]}`).notes;
  if (!scale || scale.length < 7) return [];
  return scale.slice(0, 7).map((note, i) => {
    const degRoot = Note.pitchClass(note) || note;
    return makeChordInfo(degRoot, DIATONIC_TYPES[mode][i], DIATONIC_ROMAN[mode][i]);
  });
}

/** Curated borrowed chords for a given root/mode. */
function buildBorrowed(root: string, mode: Mode): ChordInfo[] {
  return BORROWED[mode].map((b) => {
    // Transpose the tonic up by the given number of semitones.
    const transposed = Note.transpose(`${root}4`, Interval.fromSemitones(b.semitones));
    const bRoot = Note.pitchClass(transposed) || root;
    return makeChordInfo(bRoot, b.type, b.roman);
  });
}

// ── Activation ───────────────────────────────────────────────────────────────
export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  // Precompute the palette for every root × mode at startup.
  const palette: Record<string, PaletteEntry> = {};
  for (const mode of MODES) {
    for (const root of ROOTS) {
      palette[`${mode}|${root}`] = {
        diatonic: buildDiatonic(root, mode),
        borrowed: buildBorrowed(root, mode),
      };
    }
  }

  context.commands.registerCommand("cpb.open", async (arg: unknown) => {
    const track = context.getObjectFromHandle(arg as Handle, MidiTrack);

    // Snapshot the Live Set's tempo and current scale at open time so the
    // dialog can preselect the session's key and preview at project tempo.
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
      console.warn("[CPB] Could not read song scale/tempo:", err);
    }

    const allData = { roots: ROOTS, modes: MODES, palette, live };

    // Bake the precomputed palette + live context into the dialog HTML.
    const html = dialogHtml.replace("/*__DATA__*/null", JSON.stringify(allData));

    let resultJson: string;
    try {
      resultJson = await context.ui.showModalDialog(
        `data:text/html,${encodeURIComponent(html)}`,
        980,
        660,
      );
    } catch (err) {
      // Dialog dismissed (Escape / window close) — nothing to do.
      console.log("[CPB] Dialog closed without writing:", err);
      return;
    }

    // Write contract v2: the webview renders the final performance itself and
    // sends a ready-to-write note list — the extension stays a dumb writer.
    let result: {
      action: string;
      clipName: string;
      lengthBeats: number;
      notes: Array<{ pitch: number; startTime: number; duration: number; velocity: number }>;
    };
    try {
      result = JSON.parse(resultJson);
    } catch {
      return;
    }

    if (result.action !== "write" || !result.notes?.length) return;

    await writeNotesToTrack(context, track, result);
  });

  context.ui.registerContextMenuAction(
    "MidiTrack",
    "Build Chord Progression…",
    "cpb.open",
  );
}

// ── Write MIDI clip ──────────────────────────────────────────────────────────
async function writeNotesToTrack(
  context: ReturnType<typeof initialize>,
  track: MidiTrack<"1.0.0">,
  result: {
    clipName: string;
    lengthBeats: number;
    notes: Array<{ pitch: number; startTime: number; duration: number; velocity: number }>;
  },
): Promise<void> {
  const song = context.application.song;

  const findTrack = () =>
    song.tracks.find((t) => t.handle.id === track.handle.id) as
      | MidiTrack<"1.0.0">
      | undefined;

  let midiTrack = findTrack();
  if (!midiTrack) {
    console.error("[CPB] Track not found.");
    return;
  }

  // Sanitize the incoming notes defensively (the webview is trusted, but the
  // clip write should never fail on a stray value).
  const notes = result.notes
    .filter((n) => Number.isFinite(n.pitch) && Number.isFinite(n.startTime) && n.duration > 0)
    .map((n) => ({
      pitch: Math.max(0, Math.min(127, Math.round(n.pitch))),
      startTime: Math.max(0, n.startTime),
      duration: n.duration,
      velocity: Math.max(1, Math.min(127, Math.round(n.velocity ?? 96))),
    }));
  if (!notes.length) return;

  const lengthBeats = Math.max(
    result.lengthBeats || 0,
    ...notes.map((n) => n.startTime + n.duration),
  );

  // Find the first empty session slot; if every slot is taken, append a new
  // scene so the write never fails.
  let emptySlot = midiTrack.clipSlots.find((slot) => !slot.clip);
  if (!emptySlot) {
    console.log("[CPB] No empty clip slot — creating a new scene.");
    await song.createScene(-1);
    midiTrack = findTrack();
    emptySlot = midiTrack?.clipSlots.find((slot) => !slot.clip);
  }
  if (!midiTrack || !emptySlot) {
    console.error("[CPB] No empty clip slot available on this track.");
    return;
  }

  const clip = await emptySlot.createMidiClip(lengthBeats);
  // Group the property writes into a single undo step.
  context.withinTransaction(() => {
    clip.name = result.clipName || "Chord Progression";
    clip.notes = notes;
    clip.looping = true;
  });

  console.log(
    `[CPB] Wrote "${clip.name}" — ${notes.length} note(s) over ${lengthBeats} beats.`,
  );
}
