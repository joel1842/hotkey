import { fullDocumentRange } from '../documentRegions';
import { ActionContext, ActionOutcome } from './types';
import { matchEdges, stripFence } from './response';

interface WholeFileOptions {
  readonly summary: string;
  readonly alreadyDoneReason: string;
  readonly notes?: string;
}

export function planWholeFileReplacement(
  response: string,
  context: ActionContext,
  { summary, alreadyDoneReason, notes }: WholeFileOptions,
): ActionOutcome {
  const { document } = context;
  const original = document.getText();
  const updated = matchEdges(original, stripFence(response));

  if (updated.trim().length === 0) {
    return { noChange: true, reason: 'the model returned an empty file', notes };
  }
  if (updated === original) {
    return { noChange: true, reason: alreadyDoneReason, notes };
  }

  return {
    edits: [{ uri: document.uri, range: fullDocumentRange(document), text: updated }],
    newFiles: [],
    summary,
    notes,
  };
}
