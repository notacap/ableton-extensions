# @ableton-extensions/create-extension

Scaffold a new [Ableton Live](https://www.ableton.com/) extension built with
`@ableton-extensions/sdk` and `@ableton-extensions/cli`.

The SDK is currently in beta and is **not published to npm**. It is distributed
as a zip from Centercode containing the SDK and CLI packages, this project
creator, and the rendered docs. Run the bundled `.tgz` with `npx`:

```sh
mkdir my-ext
cd my-ext
npx file:/path/to/extracted/ableton-create-extension-<version>.tgz
```

You'll be prompted for:

- **Extension name** — defaults to the directory name
- **Author**
- **Path to Ableton Live** — auto-detected on macOS and Windows
- **UI?** — opt in to a Vite webview scaffold

The scaffold writes `EXTENSION_HOST_PATH` to a gitignored `.env`, installs
dependencies, and prints next steps. If VS Code is detected on your `PATH`,
`.vscode/launch.json` and `tasks.json` are added for one-keystroke F5
debugging.
