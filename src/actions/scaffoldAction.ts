import * as vscode from 'vscode';
import { findEnclosingSymbolRange } from '../documentRegions';
import {
  diagnosticsSection,
  fileSection,
  houseRules,
  joinSections,
  selectionSection,
} from '../prompt';
import { ActionContext, ActionOutcome, HotkeyAction } from './types';
import { planWholeFileReplacement } from './wholeFile';

const SYSTEM = `You finish code that a developer is part-way through writing.

They have marked the construct they are working on. Make it real:

1. Write the implementation. Fill in the body, handle the cases the name and signature imply, and produce what callers need. This is the main task — put your effort here.
2. Make it work in the file: add the imports it needs, and connect it where the file's own patterns say it belongs — the export list, the registration array, the switch, the setup function, the call site it was clearly written for.

Return the complete file.

Rules:
- Output the whole file from its first line to its last, and nothing else. No fences, no commentary, no line numbers.
- Reproduce every part of the file you did not change byte for byte.
- Never leave a placeholder. No TODO comments, no "not implemented" throws, no ellipsis, no stub that returns null just to satisfy a type. If the intent is genuinely unclear, implement the most reasonable reading of the name, the signature, and the surrounding code.
- What the developer already wrote is the specification. Extend their partial body, names, and signature — do not discard them for your own design.
- Infer intent from the construct's name and signature, its types, the diagnostics, and how similar things are written elsewhere in this file.
- Match the file's idioms: its error handling, async style, naming, and formatting.
- Do not add tests, doc comments, or logging unless the file's other code has them.
- Change nothing that finishing and connecting this construct does not require.
- If it is already finished and connected, return the file unchanged.`;

export const scaffoldAction: HotkeyAction = {
  id: 'scaffold',
  label: 'Scaffold',
  emptySelectionHint: 'Put the cursor inside the thing you are writing, or select it.',

  widenFromCursor(document: vscode.TextDocument, position: vscode.Position) {
    return findEnclosingSymbolRange(document, position);
  },

  buildPrompt(context: ActionContext) {
    return {
      system: SYSTEM + houseRules(context),
      user: joinSections(
        fileSection(context),
        selectionSection(context),
        diagnosticsSection(context, { wholeFile: true }),
        'Finish the marked construct, connect it into this file, and return the complete file.',
      ),
    };
  },

  plan(response: string, context: ActionContext): ActionOutcome {
    return planWholeFileReplacement(response, context, {
      summary: 'scaffolded',
      alreadyDoneReason: 'it already looks finished',
    });
  },
};
