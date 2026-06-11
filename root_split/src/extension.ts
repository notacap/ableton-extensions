import {
  initialize,
  AudioClip,
  Clip,
  ClipSlot,
  MidiClip,
  MidiTrack,
  TakeLane,
  Song,
  type ActivationContext,
  type ExtensionContext,
  type Handle,
  type NoteDescription,
} from "@ableton-extensions/sdk";
import { Chord, Note } from "tonal";

// ─────────────────────────────────────────────────────────────────────────────
// Root Split
//
// Right-click a chord MIDI clip → split it into two new MIDI clips on the same
// track: one holding only each chord's ROOT note, the other holding every
// non-root note. Two flavours decide what "root" means:
//
//   • Bass Note  — the lowest note of each simultaneous group is the root.
//   • Chord Root — detect the chord (via tonal) and take its harmonic root,
//                  so an inversion like C/E (E-G-C) still roots on C, not E.
//                  Falls back to the bass note when detection is ambiguous.
//
// A "chord" is a group of notes that start at (approximately) the same time.
// The action only proceeds when the clip actually contains chords — i.e. at
// least one onset group has two or more notes.
// ─────────────────────────────────────────────────────────────────────────────

type RootMode = "bass" | "theory";

// The SDK classes are generic over the API version; pin it once.
type V = "1.0.0";

// Notes whose onsets fall within this many beats of each other are treated as
// one chord. Tolerant enough for light humanization, tight enough to keep
// adjacent chords apart (1/32 note at 4/4).
const ONSET_TOLERANCE = 0.03125;

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  context.commands.registerCommand("rootsplit.bass", (arg: unknown) =>
    runRootSplit(context, arg as Handle, "bass"),
  );
  context.commands.registerCommand("rootsplit.theory", (arg: unknown) =>
    runRootSplit(context, arg as Handle, "theory"),
  );

  context.ui.registerContextMenuAction(
    "MidiClip",
    "Root Split — Bass Note",
    "rootsplit.bass",
  );
  context.ui.registerContextMenuAction(
    "MidiClip",
    "Root Split — Chord Root",
    "rootsplit.theory",
  );
}

// ── Command body ─────────────────────────────────────────────────────────────
async function runRootSplit(
  context: ExtensionContext<V>,
  handle: Handle,
  mode: RootMode,
): Promise<void> {
  try {
    const clip = context.getObjectFromHandle(handle, Clip);
    if (!(clip instanceof MidiClip) || clip instanceof AudioClip) {
      await showMessage(context, "Root Split", "This only works on MIDI clips.");
      return;
    }

    const notes = clip.notes;
    if (notes.length === 0) {
      await showMessage(context, "Root Split", "This clip has no notes.");
      return;
    }

    // Resolve the owning MIDI track up front (before we create scenes, which
    // invalidates handles). We re-find it from the live Song by id afterwards.
    const track = resolveMidiTrack(clip);
    if (!track) {
      await showMessage(
        context,
        "Root Split",
        "Couldn't find the MIDI track that owns this clip.",
      );
      return;
    }
    const trackId = track.handle.id;

    // Group notes into chords by onset, then pick each group's root.
    const groups = groupByOnset(notes);
    const rootIndices = new Set<number>();
    let chordCount = 0;
    for (const group of groups) {
      if (group.length >= 2) chordCount++;
      rootIndices.add(pickRootIndex(notes, group, mode));
    }

    if (chordCount === 0) {
      await showMessage(
        context,
        "Root Split",
        "This clip doesn't contain chords — every note plays on its own. " +
          "Root Split needs a clip made of chords (notes that sound together).",
      );
      return;
    }

    const rootNotes = notes.filter((_, i) => rootIndices.has(i));
    const otherNotes = notes.filter((_, i) => !rootIndices.has(i));

    const length = clipLength(clip, notes);
    const color = clip.color;

    // The root clip is named for the split method ("Bass" / "Root"); the other
    // clip keeps the original clip's name.
    const rootClipName = mode === "bass" ? "Bass" : "Root";
    const otherClipName = clip.name || "Clip";

    // Write the two clips into the next empty Session slots on the same track.
    const song = context.application.song;
    await writeClip(context, song, trackId, rootClipName, rootNotes, length, color);
    await writeClip(context, song, trackId, otherClipName, otherNotes, length, color);

    console.log(
      `[RootSplit] ${mode} — ${chordCount} chord(s): ` +
        `${rootNotes.length} root note(s), ${otherNotes.length} other note(s).`,
    );
  } catch (err) {
    console.error("[RootSplit] Failed:", err);
    await showMessage(
      context,
      "Root Split",
      "Something went wrong while splitting the clip. See ExtensionHost.txt for details.",
    );
  }
}

// ── Chord grouping & root detection ──────────────────────────────────────────

/**
 * Cluster note indices into chords by start time. Notes are sorted by onset,
 * then a new group begins whenever a note starts more than ONSET_TOLERANCE
 * beats after the current group's anchor onset.
 */
function groupByOnset(notes: NoteDescription[]): number[][] {
  const order = notes
    .map((_, i) => i)
    .sort((a, b) => notes[a]!.startTime - notes[b]!.startTime);

  const groups: number[][] = [];
  let current: number[] = [];
  let anchor = Number.NEGATIVE_INFINITY;

  for (const i of order) {
    const start = notes[i]!.startTime;
    if (current.length === 0 || start - anchor <= ONSET_TOLERANCE) {
      if (current.length === 0) anchor = start;
      current.push(i);
    } else {
      groups.push(current);
      current = [i];
      anchor = start;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** Index (into `notes`) of the chosen root note for one onset group. */
function pickRootIndex(
  notes: NoteDescription[],
  group: number[],
  mode: RootMode,
): number {
  const lowest = bassIndex(notes, group);
  if (mode === "bass" || group.length < 2) return lowest;

  // Chord-root mode: detect the chord from its pitch classes (bass first so
  // tonal surfaces inversions as slash chords), then pick the harmonic root.
  const ascending = [...group].sort((a, b) => notes[a]!.pitch - notes[b]!.pitch);
  const pcs: string[] = [];
  const seen = new Set<number>();
  for (const idx of ascending) {
    const chroma = notes[idx]!.pitch % 12;
    if (!seen.has(chroma)) {
      seen.add(chroma);
      pcs.push(Note.pitchClass(Note.fromMidi(notes[idx]!.pitch)));
    }
  }

  const tonic = detectChordRoot(pcs);
  if (!tonic) return lowest;
  const tonicChroma = Note.chroma(tonic);
  if (tonicChroma === undefined) return lowest;

  // Lowest-octave instance of the root pitch class within the group.
  for (const idx of ascending) {
    if (notes[idx]!.pitch % 12 === tonicChroma) return idx;
  }
  return lowest;
}

/**
 * Harmonic root (pitch class) of a chord given its pitch classes in ascending
 * (bass-first) order, or null if undetectable.
 *
 * tonal's `Chord.detect` lists every plausible naming, but its ranking favours
 * a root-position reading of whatever note is in the bass — so an inversion
 * like E-G-C is offered as "Em#5" *before* "CM/E". We instead score each
 * candidate by how ordinary its chord quality is (major/minor triads beat
 * augmented/altered oddities) after stripping any slash bass, so inversions
 * resolve to their true root. Ties keep the earliest (most bass-aligned).
 */
function detectChordRoot(pcs: string[]): string | null {
  let bestTonic: string | null = null;
  let bestScore = -Infinity;
  for (const symbol of Chord.detect(pcs)) {
    const chord = Chord.get(symbol.split("/")[0]!); // drop "/bass" inversion tag
    if (!chord.tonic) continue;
    const score = qualityScore(chord.quality);
    if (score > bestScore) {
      bestScore = score;
      bestTonic = chord.tonic;
    }
  }
  return bestTonic;
}

/** Commonness of a chord quality — higher wins when naming an ambiguous set. */
function qualityScore(quality: string): number {
  switch (quality) {
    case "Major":
    case "Minor":
      return 3;
    case "Diminished":
      return 2;
    case "Augmented":
      return 0; // rare; deprioritize so "Em#5"-style readings lose to plain triads
    default:
      return 1; // Unknown / other
  }
}

/** Index of the lowest-pitched note in a group (ties broken by earliest onset). */
function bassIndex(notes: NoteDescription[], group: number[]): number {
  let best = group[0]!;
  for (const idx of group) {
    if (
      notes[idx]!.pitch < notes[best]!.pitch ||
      (notes[idx]!.pitch === notes[best]!.pitch &&
        notes[idx]!.startTime < notes[best]!.startTime)
    ) {
      best = idx;
    }
  }
  return best;
}

// ── Clip writing ─────────────────────────────────────────────────────────────

/** Length in beats for the new clips: the original clip's region, never shorter
 *  than the notes it must hold. */
function clipLength(clip: MidiClip<V>, notes: NoteDescription[]): number {
  const span = notes.reduce(
    (max, n) => Math.max(max, n.startTime + Math.max(0, n.duration)),
    0,
  );
  let reported = clip.endMarker - clip.startMarker;
  if (!Number.isFinite(reported) || reported <= 0) reported = span;
  return Math.max(reported, span, 0.25);
}

function findMidiTrackById(song: Song<V>, id: bigint): MidiTrack<V> | undefined {
  return song.tracks.find(
    (t): t is MidiTrack<V> => t instanceof MidiTrack && t.handle.id === id,
  );
}

/** Create one MIDI clip in the next empty Session slot of the track, appending
 *  a scene if every slot is full. Re-resolves the track each call (handles go
 *  stale after createScene). */
async function writeClip(
  context: ExtensionContext<V>,
  song: Song<V>,
  trackId: bigint,
  name: string,
  notes: NoteDescription[],
  length: number,
  color: number,
): Promise<void> {
  let track = findMidiTrackById(song, trackId);
  if (!track) {
    console.error("[RootSplit] Track no longer available.");
    return;
  }

  let slot = track.clipSlots.find((s) => !s.clip);
  if (!slot) {
    await song.createScene(-1);
    track = findMidiTrackById(song, trackId);
    slot = track?.clipSlots.find((s) => !s.clip);
  }
  if (!slot) {
    console.error("[RootSplit] No empty clip slot available on the track.");
    return;
  }

  const clip = await slot.createMidiClip(length);
  context.withinTransaction(() => {
    clip.name = name;
    clip.color = color;
    clip.notes = notes;
    clip.looping = true;
  });
}

// ── Resolve the owning MIDI track from a clip ────────────────────────────────
function resolveMidiTrack(clip: MidiClip<V>): MidiTrack<V> | null {
  let parent = clip.parent; // Session → ClipSlot; Arrangement → Track/TakeLane
  if (parent instanceof ClipSlot) parent = parent.parent;
  if (parent instanceof TakeLane) parent = parent.parent;
  return parent instanceof MidiTrack ? parent : null;
}

// ── Minimal themed message dialog (errors / guidance) ────────────────────────
async function showMessage(
  context: ExtensionContext<V>,
  title: string,
  body: string,
): Promise<void> {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{
  --bg:hsl(0,0%,21%);--text:hsl(0,0%,71%);--accent:hsl(31,100%,67%);
  --btn-text:hsl(0,0%,7%);--border:hsl(0,0%,7%);
}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--text);
  font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;
  display:flex;flex-direction:column;padding:16px;box-sizing:border-box}
h1{font-size:13px;font-weight:700;margin:0 0 10px;color:var(--text)}
p{margin:0;line-height:1.5;flex:1}
.row{display:flex;justify-content:flex-end;margin-top:14px}
button{background:var(--accent);color:var(--btn-text);border:1px solid var(--border);
  border-radius:3px;padding:6px 18px;font-size:13px;font-weight:600;cursor:pointer}
button:focus{outline:2px solid var(--accent);outline-offset:1px}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
<div class="row"><button id="ok" autofocus>OK</button></div>
<script>
  var wk=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.live;
  var wv=window.chrome&&window.chrome.webview;
  function close(){var m={method:"close_and_send",params:["ok"]};
    if(wk)wk.postMessage(m);else if(wv)wv.postMessage(m);}
  document.getElementById("ok").addEventListener("click",close);
  document.addEventListener("keydown",function(e){
    if(e.key==="Enter"||e.key==="Escape")close();});
  document.getElementById("ok").focus();
</script></body></html>`;

  try {
    await context.ui.showModalDialog(
      `data:text/html,${encodeURIComponent(html)}`,
      380,
      190,
    );
  } catch {
    // Dialog dismissed via window close — nothing to do.
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
