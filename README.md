# Hotkey

Five keys for the code you have selected. No prompt to type, no menu to pick from — each
key does one thing.

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


## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| `hotkey.provider` | `anthropic` | `anthropic` or `openai` |
| `hotkey.models` | per-provider map | `{"anthropic": "claude-opus-5", "openai": "gpt-5.5"}` |
| `hotkey.effort` | `high` | `output_config.effort` on Anthropic, `reasoning.effort` on OpenAI; `default` omits it |
| `hotkey.adaptiveThinking` | `true` | Anthropic only (`thinking: adaptive`); OpenAI ignores it |
| `hotkey.maxTokens` | `64000` | Hitting the cap is reported, never applied half-written |
| `hotkey.includeDiagnostics` | `true` | Sends the file's errors and warnings — this is what makes Import accurate |
| `hotkey.systemPromptSuffix` | `""` | House rules appended to all three actions |

## Packaging

```bash
npm run typecheck
npm run build
npx vsce package     # -> hotkey-0.0.1.vsix
```
