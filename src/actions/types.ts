import * as vscode from 'vscode';
import { HotkeyConfig } from '../config';

export type RangeSource = 'selection' | 'symbol' | 'line';

export interface ActionContext {
  readonly document: vscode.TextDocument;
  readonly range: vscode.Range;
  readonly selectionText: string;
  readonly rangeSource: RangeSource;
  readonly siblingFiles: readonly string[];
  readonly config: HotkeyConfig;
}

export interface PlannedEdit {
  readonly uri: vscode.Uri;
  readonly range: vscode.Range;
  readonly text: string;
}

export interface NewFile {
  readonly uri: vscode.Uri;
  readonly contents: string;
}

/**
 * Residue an action could not put in the file — a rename it withheld, or what a
 * deleted comment said that code cannot express. Goes to the log, never back
 * into the source.
 */
interface WithNotes {
  readonly notes?: string;
}

export interface EditPlan extends WithNotes {
  readonly edits: readonly PlannedEdit[];
  readonly newFiles: readonly NewFile[];
  readonly summary: string;
  readonly openFile?: vscode.Uri;
}

export interface NoChange extends WithNotes {
  readonly noChange: true;
  readonly reason: string;
}

export type ActionOutcome = EditPlan | NoChange;

export interface HotkeyAction {
  readonly id: string;
  readonly label: string;
  readonly emptySelectionHint: string;
  /**
   * Where to work when nothing is selected. Falling through to undefined uses
   * the cursor's own line.
   */
  widenFromCursor?(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Range | undefined>;
  buildPrompt(context: ActionContext): { system: string; user: string };
  plan(response: string, context: ActionContext): ActionOutcome;
}

export function isNoChange(outcome: ActionOutcome): outcome is NoChange {
  return 'noChange' in outcome;
}
