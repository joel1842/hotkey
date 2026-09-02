import { findImportRegion } from '../documentRegions';
import {
  diagnosticsSection,
  fileSection,
  houseRules,
  joinSections,
  selectionSection,
} from '../prompt';
import { ActionContext, ActionOutcome, HotkeyAction } from './types';
import { stripFence } from './response';

const SYSTEM = `You resolve imports for a single source file inside a VS Code extension.

The developer has selected a region of code that references something not yet imported. Return the complete import block for this file: every import the file still needs, plus whatever the selected region requires.

Rules:
- Output import lines only. No fences, no commentary, no other code from the file.
- Keep every existing import that is still used, in the order it already appears.
- Merge into an existing statement when the language allows it, rather than adding a second statement for the same module.
- Match the file's existing style exactly: quote marks, semicolons, path aliases, type-only imports, default vs named, grouping.
- Resolve module paths the way the file's current imports do, relative to this file's own directory.
- Infer what a symbol belongs to from how it is used and from the diagnostics. Do not invent a module you have no evidence for.
- If nothing needs adding, return the existing import block unchanged.`;

export const importAction: HotkeyAction = {
  id: 'import',
  label: 'Import',
  emptySelectionHint: 'Put the cursor on the line that references the missing symbol.',

  buildPrompt(context: ActionContext) {
    const region = findImportRegion(context.document);
    const currentImports = region.exists
      ? ['--- CURRENT IMPORT BLOCK (you are replacing exactly these lines) ---', region.text, '--- END IMPORT BLOCK ---'].join('\n')
      : `--- CURRENT IMPORT BLOCK ---\nThis file has no imports yet. Your output will be inserted at line ${region.range.start.line + 1}.\n--- END IMPORT BLOCK ---`;

    return {
      system: SYSTEM + houseRules(context),
      user: joinSections(
        fileSection(context),
        currentImports,
        selectionSection(context),
        diagnosticsSection(context, { wholeFile: true }),
        'Return the complete import block for this file.',
      ),
    };
  },

  plan(response: string, context: ActionContext): ActionOutcome {
    const region = findImportRegion(context.document);
    const imports = stripFence(response).trim();

    if (imports.length === 0) {
      return { noChange: true, reason: 'the model returned no imports' };
    }
    if (region.exists && imports === region.text.trim()) {
      return { noChange: true, reason: 'imports are already complete' };
    }

    const text = region.exists ? imports : `${imports}\n`;
    return {
      edits: [{ uri: context.document.uri, range: region.range, text }],
      newFiles: [],
      summary: region.exists ? 'imports updated' : 'imports added',
    };
  },
};
