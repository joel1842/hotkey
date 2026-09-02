# Hotkey

Five keys for the code you have selected. No prompt to type, no menu to pick from — each
key does one thing. Bring your own key — Anthropic, OpenAI, or Gemini.

Not on the Marketplace: see [Installing from source](#installing-from-source).

| Key | Action | What it does |
| --- | --- | --- |
| <kbd>Cmd+Ctrl+S</kbd> | **Scaffold** | Finishes the thing you're part-way through writing — writes the implementation, adds its imports, connects it into the file |
| <kbd>Cmd+Ctrl+I</kbd> | **Import** | Adds the imports the selected code needs, merging into your existing import block |
| <kbd>Cmd+Ctrl+W</kbd> | **Wire up** | Hooks the selected construct into the rest of the file |
| <kbd>Cmd+Ctrl+B</kbd> | **Break out** | Moves the selection into its own file, carries its imports along, imports it back, and deletes the original |
| <kbd>Cmd+Ctrl+U</kbd> | **Uncle Bobify** | Clean-code pass over the selection: decompose, rename, hoist magic values, delete every comment, modernise idioms |

On Windows and Linux the same keys are <kbd>Ctrl+Alt+S</kbd> / <kbd>I</kbd> / <kbd>W</kbd> / <kbd>B</kbd> / <kbd>U</kbd>.

Every action lands as a single `WorkspaceEdit`, so one <kbd>Cmd+Z</kbd> undoes it —
including Break out, where the file creation, the import, and the deletion undo together.

## Watching a request

The model's output streams verbatim into the **Hotkey Output** channel, which reveals itself
(without stealing focus) when a request starts. Each run appends a header and a footer, so
the channel becomes a running history of what the model actually said:

```
──────── Uncle Bobify · Anthropic claude-opus-5 · src/sync.ts:12-64 · 14:22:07 ────────
const ASSET_TAG_FORMAT = /^[A-Z]{2}-\d{4}$/;
...
──────── done in 8.4s · 2,317 characters ────────
```

That is a separate channel from **Hotkey** (the log), deliberately: the log is a
`LogOutputChannel`, which stamps every append with a timestamp and level — fine for
diagnostics, unusable for token-by-token text. **Hotkey: Show Streamed Output** opens this
one, **Hotkey: Show Log** the other.

Meanwhile the bottom-right corner shows a live timer:

```
⟳ Uncle Bobify 8.4s · 2,317 chars
```

It runs off its own 100ms clock rather than off streamed deltas, so it keeps counting during
the silence before the first token — which on a high-effort request is most of the wait. It
disappears when the request settles, however it settles.

The progress notification stays where it was, because it carries the Cancel button.
Cancelling aborts the HTTP request rather than just dismissing the toast, and the footer
records `cancelled after 2.1s`. A failure records the reason the same way.

## Providers

Bring your own key. Each provider keeps its own key (in VS Code SecretStorage, never in
your settings file) and its own remembered model, so switching between them does not make
you re-enter anything.

| Provider | Default model | Key from | Env fallback |
| --- | --- | --- | --- |
| `anthropic` | `claude-opus-5` | [console.anthropic.com](https://console.anthropic.com/settings/keys) | `ANTHROPIC_API_KEY` |
| `openai` | `gpt-5.5` | [platform.openai.com](https://platform.openai.com/api-keys) | `OPENAI_API_KEY` |
| `gemini` | `gemini-pro-latest` | [aistudio.google.com](https://aistudio.google.com/apikey) | `GEMINI_API_KEY` |

**Hotkey: Select Provider** switches between them; **Hotkey: Select Model** lists what the
current key can actually reach and remembers your pick for that provider alone. The status
bar shows the live model, and clicking it opens the model picker.

`hotkey.effort` is the one knob every provider understands, and each maps it to its own
parameter. Gemini has no thinking level above `high`, so `xhigh` and `max` clamp to it. If a
model rejects the tuning parameters outright, the request is retried once without them
rather than failing — which is what makes older, non-reasoning models usable.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| `hotkey.provider` | `anthropic` | `anthropic`, `openai`, or `gemini` |
| `hotkey.models` | per-provider map | `{"anthropic": "claude-opus-5", "openai": "gpt-5.5", "gemini": "gemini-pro-latest"}` |
| `hotkey.effort` | `high` | `output_config.effort` on Anthropic, `reasoning.effort` on OpenAI, `thinkingConfig.thinkingLevel` on Gemini; `default` omits it |
| `hotkey.adaptiveThinking` | `true` | Anthropic only (`thinking: adaptive`); OpenAI and Gemini ignore it |
| `hotkey.maxTokens` | `64000` | Hitting the cap is reported, never applied half-written |
| `hotkey.includeDiagnostics` | `true` | Sends the file's errors and warnings — this is what makes Import accurate |
| `hotkey.systemPromptSuffix` | `""` | House rules appended to all three actions |

## Installing from source

Hotkey is not on the Marketplace — you build it from this repo and install the resulting
`.vsix`. You need **Node 20+** and **VS Code 1.96+**.

### 1. Build the extension

```bash
git clone https://github.com/joel1842/hotkey.git
cd hotkey
npm install
npm run package
```

That leaves a `hotkey-0.0.1.vsix` in the repo root (the filename tracks the `version` in
`package.json`). `npm run package` typechecks and bundles first, so it is the only command
you need — `npm run typecheck` and `npm run build` are there for running either step alone.

### 2. Install the `.vsix`

From the terminal, if you have the `code` command on your PATH:

```bash
code --install-extension hotkey-0.0.1.vsix
```

If `code` is not found, open the Command Palette in VS Code
(<kbd>Cmd+Shift+P</kbd> / <kbd>Ctrl+Shift+P</kbd>) and run
**Shell Command: Install 'code' command in PATH**, then try again.

Or install it entirely from the UI, no PATH setup needed: open the **Extensions** view
(<kbd>Cmd+Shift+X</kbd> / <kbd>Ctrl+Shift+X</kbd>), click the **⋯** menu at the top of the
panel, choose **Install from VSIX…**, and pick the file you just built.

Either way, reload the window when VS Code offers to.

### 3. Add an API key

Run **Hotkey: Set API Key** from the Command Palette, pick a provider, and paste a key —
see [Providers](#providers) for where each key comes from. The key goes into VS Code
SecretStorage, not your settings file. If you already export `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, or `GEMINI_API_KEY` in your shell, Hotkey picks that up and you can skip
this step.

Select some code and press <kbd>Cmd+Ctrl+U</kbd> to confirm it works.

### Updating

```bash
git pull
npm install
npm run package
code --install-extension hotkey-0.0.1.vsix --force
```

`--force` overwrites the installed copy instead of asking. Reload the window afterwards.

### Hacking on it instead

To run the extension from source without installing it, open the repo in VS Code and press
<kbd>F5</kbd>. That builds it and launches a second VS Code window with Hotkey loaded from
your working tree, so edits show up on the next <kbd>F5</kbd>. `npm run watch` rebuilds on
save if you would rather not keep restarting.
