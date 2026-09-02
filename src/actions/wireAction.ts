import {
  diagnosticsSection,
  fileSection,
  houseRules,
  joinSections,
  selectionSection,
} from '../prompt';
import { ActionContext, ActionOutcome, HotkeyAction } from './types';
import { planWholeFileReplacement } from './wholeFile';

const SYSTEM = `You finish and integrate a piece of code inside a single source file.

The developer has selected a construct they are part-way through writing. Do two things, in order:
1. If the construct is incomplete, finish it — matching how the rest of the file is written.
2. Wire it into the file: add the calls, registrations, exports, handler bindings, route entries, dispatch cases, or subscriptions needed for it to actually be used, at the places in this file where they belong.

Return the complete file.

Rules:
- Output the whole file from its first line to its last, and nothing else. No fences, no commentary, no line numbers.
- Reproduce every part of the file you did not change byte for byte.
- Change only what finishing and wiring the selected construct requires. Do not reformat, rename, or refactor anything else, and do not touch unrelated code.
- Wire it up where the file's own patterns say it goes. If the file registers similar things in a list, array, switch, or setup function, follow that pattern rather than inventing a new one.
- Add any imports the wiring needs to the file's existing import block.
- If the construct is already complete and already wired up, return the file unchanged.`;

export const wireAction: HotkeyAction = {
  id: 'wire',
  label: 'Wire up',
  emptySelectionHint: 'Select the function or construct you want finished and wired up.',

  buildPrompt(context: ActionContext) {
    return {
      system: SYSTEM + houseRules(context),
      user: joinSections(
        fileSection(context),
        selectionSection(context),
        diagnosticsSection(context, { wholeFile: true }),
        'Finish the selected construct if needed, wire it into this file, and return the complete file.',
      ),
    };
  },

  plan(response: string, context: ActionContext): ActionOutcome {
    return planWholeFileReplacement(response, context, {
      summary: 'selection finished and wired up',
      alreadyDoneReason: 'it is already complete and wired up',
    });
  },
};
