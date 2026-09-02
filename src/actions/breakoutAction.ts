import * as path from 'path';
import * as vscode from 'vscode';
import { findImportRegion } from '../documentRegions';
import {
  diagnosticsSection,
  fileSection,
  houseRules,
  joinSections,
  selectionSection,
} from '../prompt';
import { ActionContext, ActionOutcome, HotkeyAction, PlannedEdit } from './types';
import { matchEdges, splitSections } from './response';

const MARKER_PREFIX = '@@HOTKEY_';
const NOTHING = 'NOTHING';
const NONE = 'NONE';

const SYSTEM = `You extract a piece of code out of one source file into its own new file.

Reply in exactly this format, with no fences and no commentary anywhere:

@@HOTKEY_PATH
<workspace-relative path for the new file>
@@HOTKEY_NEWFILE
<complete contents of the new file>
@@HOTKEY_REPLACEMENT
<text that replaces the extracted region in the original file, or the single word NOTHING>
@@HOTKEY_IMPORTS
<the complete import block for the original file after the extraction, or the single word NONE>

Rules:
- The new file must stand alone: carry over every import the extracted code needs, and export the extracted thing.
- Name the new file the way its siblings are named — match their casing and extension conventions exactly.
- Put the new file in the directory the sibling list suggests for this kind of code; default to the original file's own directory.
- @@HOTKEY_REPLACEMENT is only what must remain at that exact spot. Usually that is NOTHING, because the point is to remove the code. Use it when the extracted code was being used inline there and a reference has to stay behind.
- @@HOTKEY_IMPORTS is the original file's whole import block rewritten: keep the imports it still needs, drop any that only the extracted code used, and add the import of the new file. Return NONE only if the original file needs no imports at all.
- Never leave a copy of the extracted code in the original file.`;

export const breakoutAction: HotkeyAction = {
  id: 'breakout',
  label: 'Break out',
  emptySelectionHint: 'Select the code you want moved into its own file.',

  buildPrompt(context: ActionContext) {
    const region = findImportRegion(context.document);
    const directory = path.posix.dirname(
      vscode.workspace.asRelativePath(context.document.uri),
    );

    return {
      system: SYSTEM + houseRules(context),
      user: joinSections(
        fileSection(context),
        selectionSection(context),
        region.exists
          ? ['--- CURRENT IMPORT BLOCK OF THE ORIGINAL FILE ---', region.text, '--- END IMPORT BLOCK ---'].join('\n')
          : '--- CURRENT IMPORT BLOCK OF THE ORIGINAL FILE ---\nThis file has no imports yet.\n--- END IMPORT BLOCK ---',
        [`--- SIBLING FILES IN ${directory} ---`, ...context.siblingFiles, '--- END SIBLINGS ---'].join('\n'),
        diagnosticsSection(context),
        'Extract the selected region into its own file.',
      ),
    };
  },

  plan(response: string, context: ActionContext): ActionOutcome {
    const sections = splitSections(response, MARKER_PREFIX);
    const rawPath = (sections.get('PATH') ?? '').trim();
    const contents = (sections.get('NEWFILE') ?? '').trim();

    if (rawPath.length === 0 || contents.length === 0) {
      throw new Error(
        'The model did not reply in the expected format (missing PATH or NEWFILE section). Run "Hotkey: Show Log" to see what came back.',
      );
    }

    const uri = resolveNewFileUri(rawPath, context.document);
    const rawReplacement = sections.get('REPLACEMENT') ?? '';
    const imports = (sections.get('IMPORTS') ?? '').trim();

    const edits: PlannedEdit[] = [
      {
        uri: context.document.uri,
        range: context.range,
        text:
          rawReplacement.trim() === NOTHING
            ? ''
            : matchEdges(context.selectionText, rawReplacement),
      },
    ];

    const region = findImportRegion(context.document);
    const wantsImports = imports.length > 0 && imports !== NONE;
    if (wantsImports && !region.range.intersection(context.range)) {
      edits.push({
        uri: context.document.uri,
        range: region.range,
        text: region.exists ? imports : `${imports}\n`,
      });
    }

    return {
      edits,
      newFiles: [{ uri, contents: contents.endsWith('\n') ? contents : `${contents}\n` }],
      summary: `extracted to ${vscode.workspace.asRelativePath(uri)}`,
      openFile: uri,
    };
  },
};

function resolveNewFileUri(
  rawPath: string,
  document: vscode.TextDocument,
): vscode.Uri {
  const cleaned = rawPath.trim().split('\n')[0].trim().replace(/^["'`]|["'`]$/g, '');
  if (cleaned.length === 0) {
    throw new Error('The model returned an empty file path.');
  }
  if (path.isAbsolute(cleaned)) {
    throw new Error(`The model returned an absolute path (${cleaned}); refusing to write outside the workspace.`);
  }

  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const base = folder ? folder.uri : vscode.Uri.joinPath(document.uri, '..');
  const resolved = vscode.Uri.joinPath(base, cleaned);

  const basePath = base.fsPath.endsWith(path.sep) ? base.fsPath : `${base.fsPath}${path.sep}`;
  if (!resolved.fsPath.startsWith(basePath)) {
    throw new Error(`The model returned a path outside the workspace (${cleaned}).`);
  }
  if (resolved.fsPath === document.uri.fsPath) {
    throw new Error('The model tried to extract the code into the file it came from.');
  }

  return resolved;
}
