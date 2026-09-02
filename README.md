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

With nothing selected, **Scaffold** and **Uncle Bobify** target the whole construct the
cursor is inside — put the cursor anywhere in a function and they work on that function,
not that line. The other three fall back to the current line.

Every action lands as a single `WorkspaceEdit`, so one <kbd>Cmd+Z</kbd> undoes it —
including Break out, where the file creation, the import, and the deletion undo together.

## The actions in detail

**Scaffold** is the one you reach for mid-keystroke: you've written a signature, a name, and
maybe two lines of body, and you want the rest. Its prompt puts the weight on writing the
implementation, and forbids the thing models reach for when they're unsure — `TODO`,
`throw new Error('not implemented')`, a stub returning `null` to satisfy a type. What you
already typed is treated as the specification to extend, not a draft to replace. It also
adds imports and connects the finished thing where the file's patterns say it belongs.

**Import** replaces your file's import block rather than appending a line to it. That's the
difference between getting a second `import { useMemo } from 'react'` and getting `useMemo`
merged into the `react` import you already have. It infers the module from how the symbol
is used and from the file's diagnostics — so it's at its best right after your language
server has flagged `Cannot find name 'x'`, and it won't invent a package it has no evidence
for.

**Wire up** overlaps Scaffold deliberately — both return the whole file, because connecting
something means editing places other than your selection. The difference is emphasis: Wire
assumes the construct is basically written and concentrates on integration, where Scaffold
concentrates on writing the implementation. If you find you only ever reach for one, the
other is a line in `src/actions/index.ts`. Both constrain the model to reproduce everything
it didn't change, and both return "no changes" rather than a reshuffled file when there's
nothing to do.

**Break out** picks the new file's name and location from the conventions of its sibling
files, which it's given. It then rewrites the original file's import block — dropping
imports only the extracted code used, adding the import of the new file — and removes the
extracted code. The new file opens after the edit applies.

**Uncle Bobify** is a distillation of a Clean Code skill that normally runs as a
multi-file, git-scoped agentic pass. What survives the trip into one request over one file
is the judgment, not the process:

- **The detector, not a checklist.** It reads for stumbles rather than scanning for
  violations, and runs Ward Cunningham's expectation test on every function: read the name
  and signature, predict the body, read the body — every surprise is a defect in the name
  or the shape.
- **Readability outranks the rules**, with one exception: the zero-comment policy is
  absolute. Every comment in the region goes, including genuine *whys*. Machine-read
  directives (`eslint-disable`, `@ts-expect-error`, coverage pragmas, triple-slash
  references, JSDoc types in plain `.js`) and licence headers are tool instructions, not
  commentary, and are left alone.
- **Files build bottom-up.** Extracted helpers land *above* their callers, so the file
  climbs to its main export and no name is used before it's defined.
- **Magic values get named** — regexes always. The name states the value's role
  (`MAX_RETRY_ATTEMPTS = 3`, never `THREE = 3`).
- **Casts are defects.** `as X`, `as any`, and non-null `!` get fixed at the type's origin,
  not silenced. `as const` and `satisfies` stay.
- **Idiom modernisation keeps its correctness caveats** — the loop conversions that would
  drop a `break`, the `reduce` that spreads its accumulator into O(n²), the immutability
  swap that breaks intentional aliasing, the extracted component nested inside another
  component's body that remounts every render.

Two rules are Hotkey-specific, because a single-file request can't honour the originals:

**It never renames an export.** The skill propagates renames across the project; Hotkey
can't see the call sites, and a half-applied rename that breaks the build is worse than no
rename. Same for names crossing a serialisation boundary — API fields, DB columns, storage
and translation keys, `data-testid`. Those become suggestions instead.

**Suggestions go to the log, not the file.** The skill ends with a summary for the PR
description; Hotkey's equivalent is a `@@HOTKEY_NOTES` section carrying withheld renames
and anything a deleted comment said that code genuinely couldn't express. You get
`cleaned up — with notes` and a **Show Log** button. Nothing the model couldn't put in code
sneaks back in as a comment.

What's dropped outright: git/PR scope resolution, the `utils.ts` / `types.ts` /
`constants.ts` cross-folder module placement (that's what **Break out** is for), project-wide
rename propagation, and running your typecheck and tests afterwards. Scope is your
selection — which the skill itself sanctions: a named function means that function and the
helpers extracted from it, not the rest of its file.

## Setup

```bash
npm install
```

Press <kbd>F5</kbd> for the Extension Development Host, then:

1. **Hotkey: Select Provider** — Anthropic or OpenAI. The picker shows which already have a
   key, and offers to set one if the provider you chose doesn't.
2. **Hotkey: Set API Key** — stored in VS Code SecretStorage, per provider, never in
   settings. `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` are used as fallbacks.
3. **Hotkey: Select Model** — lists what your key can actually reach, queried live.

The active model shows in the status bar; click it to change.

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

## Safety rails

- **Nothing is applied half-finished.** A truncated (`max_tokens`), refused, or failed
  response is surfaced as an error, never written to disk.
- **Break out validates the path the model chose.** Absolute paths, paths that escape the
  workspace, and "extract this file into itself" are all rejected before any edit. An
  existing file at the target needs a modal confirmation to overwrite.
- **Concurrent edits are caught.** The document version is captured before the request; if
  you typed while the model was working, applying is gated behind a confirmation.
- **A malformed reply fails loudly.** Break out's reply format is parsed strictly; the raw
  response goes to the log (**Hotkey: Show Log**) when it doesn't match.

## How it's put together

```
src/
  runAction.ts        shared pipeline: resolve target -> stream -> plan -> apply
  requestTimer.ts     the ticking status bar indicator for one request
  log.ts              two channels: the diagnostics log, and raw streamed output
  actions/
    types.ts          HotkeyAction + EditPlan contracts
    scaffoldAction.ts plans a whole-file replacement, implementation-first
    importAction.ts   plans an import-block replacement
    wireAction.ts     plans a whole-file replacement, integration-first
    breakoutAction.ts plans a file creation + region deletion + import rewrite
    uncleBobifyAction.ts  plans a whole-file replacement, readability-first
    wholeFile.ts      shared whole-file planning used by scaffold, wire and uncle bobify
    response.ts       fence stripping, edge-newline matching, section parsing
  documentRegions.ts  finds a file's import block, and the construct under the cursor
  providers/          Anthropic and OpenAI behind one interface
```

An action is a prompt builder plus a pure `plan(response, context) -> EditPlan`, with an
optional `widenFromCursor` hook that decides what an empty selection means for that action. It never
touches the editor, which is what makes the planning logic testable without a running VS
Code. `runAction.ts` is the only place that applies edits.

Break out uses a line-delimited reply format (`@@HOTKEY_PATH`, `@@HOTKEY_NEWFILE`, …)
rather than JSON, deliberately: it needs four values, one of which is a whole source file,
and JSON-escaping a file body wastes tokens and invites escaping bugs. Delimiters also
stream and parse identically on both providers, where structured-output support differs.

## Adding another provider

`src/providers/types.ts` is the contract: `streamReplacement`, `listModels`,
`describeError`, `isAbortError`, plus a `ProviderInfo` record. Implement it in
`src/providers/<name>.ts`, add it to the array in `src/providers/index.ts`, and extend the
`hotkey.provider` enum in `package.json`.

## Packaging

```bash
npm run typecheck
npm run build
npx vsce package     # -> hotkey-0.0.1.vsix
```
