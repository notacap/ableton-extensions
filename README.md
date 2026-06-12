# Ableton Extensions

A collection of free, open-source **extensions for Ableton Live 12** — small tools that
add new context-menu actions and dialogs inside Live to speed up music-making.

Each extension lives in its own subdirectory in this repo. This is the home for all of
them; more are on the way.

## Extensions

| Extension | What it does |
|---|---|
| [**Chord Progression Builder**](chord_progression_builder/) | Right-click a MIDI track to build, audition, and write chord progressions — opens in your Set's key, with genre presets, voicings, rhythm patterns, and a built-in preview. |
| [**Root Split**](root_split/) | Right-click a chord MIDI clip to split it into two new clips — one with only each chord's root note, the other with the remaining notes. Choose bass-note or true harmonic-root detection. |

> 👉 **Click an extension's folder above** for its full feature list, screenshots, and
> usage instructions.

## Getting started

1. **Download the extension.** Grab the latest `.ablx` file from the
   [**Releases page**](https://github.com/notacap/ableton-extensions/releases).
2. **Install it in Live.** Open **Preferences → Extensions** and drag the `.ablx` into
   the Extensions list.
3. **Use it.** Right-click the relevant track or clip and pick the extension's action
   from the context menu. (See each extension's README for specifics.)

## Requirements

- **Ableton Live Suite 12.4.5 or newer.** Extensions are a Live Suite feature.

## Building from source

Each extension is a standalone Node/TypeScript project. To build one yourself, open its
subdirectory and follow the build instructions in that extension's README (typically
`npm install` then `npm run package` to produce the `.ablx`).

## License

Each extension is individually licensed — see the `LICENSE` file in its subdirectory.
Chord Progression Builder and Root Split are both released under the
[MIT License](chord_progression_builder/LICENSE).

---

Built by **hello_nocap**. Feedback and feature requests welcome!
