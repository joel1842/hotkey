import * as vscode from 'vscode';

const SCAN_LIMIT = 400;

const IMPORT_LINE =
  /^\s*(?:import\b|export\s+(?:\*|\{|type\b)[^;]*\bfrom\b|from\s+\S+\s+import\b|(?:const|let|var)\s+[^=]+=\s*require\s*\(|require\s*\(|require_relative\b|using\s+[\w.]+\s*;|#include\b|#import\b|use\s+[\w:{}\s,*]+;|@import\b)/;

const SKIPPABLE_PREFIX =
  /^\s*(?:#!|\/\/|\/\*|\*|#|--|;|"""|'''|@?['"]use\s+\w+['"]|package\s+[\w.]+\s*;?|module\s+\S+|namespace\s+\S+|<\?php|@charset)/;

export interface ImportRegion {
  readonly range: vscode.Range;
  readonly text: string;
  readonly exists: boolean;
}

export function findImportRegion(document: vscode.TextDocument): ImportRegion {
  const limit = Math.min(document.lineCount, SCAN_LIMIT);

  let first = -1;
  let last = -1;
  for (let line = 0; line < limit; line += 1) {
    if (IMPORT_LINE.test(document.lineAt(line).text)) {
      if (first === -1) {
        first = line;
      }
      last = line;
    }
  }

  if (first === -1) {
    const anchor = findInsertionAnchor(document, limit);
    const position = new vscode.Position(anchor, 0);
    return { range: new vscode.Range(position, position), text: '', exists: false };
  }

  last = extendThroughOpenBrackets(document, first, last);
  const range = new vscode.Range(
    new vscode.Position(first, 0),
    document.lineAt(last).range.end,
  );
  return { range, text: document.getText(range), exists: true };
}

function findInsertionAnchor(document: vscode.TextDocument, limit: number): number {
  let anchor = 0;
  for (let line = 0; line < limit; line += 1) {
    const text = document.lineAt(line).text;
    if (text.trim().length === 0 || SKIPPABLE_PREFIX.test(text)) {
      anchor = line + 1;
      continue;
    }
    break;
  }
  return Math.min(anchor, document.lineCount);
}

function extendThroughOpenBrackets(
  document: vscode.TextDocument,
  first: number,
  last: number,
): number {
  let end = last;
  while (end < document.lineCount - 1 && bracketBalance(document, first, end) > 0) {
    end += 1;
  }
  return end;
}

function bracketBalance(
  document: vscode.TextDocument,
  first: number,
  last: number,
): number {
  let balance = 0;
  for (let line = first; line <= last; line += 1) {
    for (const character of document.lineAt(line).text) {
      if (character === '(' || character === '{' || character === '[') {
        balance += 1;
      } else if (character === ')' || character === '}' || character === ']') {
        balance -= 1;
      }
    }
  }
  return balance;
}

export function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
  return document.validateRange(
    new vscode.Range(new vscode.Position(0, 0), new vscode.Position(document.lineCount, 0)),
  );
}

const MAX_SYMBOL_LINES = 300;

/**
 * The innermost declaration containing `position`, so an action can target the
 * whole construct the cursor sits in rather than just its current line.
 * Returns undefined when no language server answers, when nothing contains the
 * position, or when the match is so large it is probably a broken parse.
 */
export async function findEnclosingSymbolRange(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<vscode.Range | undefined> {
  let symbols: (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined;
  try {
    symbols = await vscode.commands.executeCommand<
      (vscode.DocumentSymbol | vscode.SymbolInformation)[]
    >('vscode.executeDocumentSymbolProvider', document.uri);
  } catch {
    return undefined;
  }
  if (!symbols || symbols.length === 0) {
    return undefined;
  }

  const range = innermostContaining(symbols, position);
  if (!range) {
    return undefined;
  }

  const spannedLines = range.end.line - range.start.line + 1;
  const coversWholeFile = spannedLines >= document.lineCount;
  if (coversWholeFile || spannedLines > MAX_SYMBOL_LINES) {
    return undefined;
  }

  return range;
}

function innermostContaining(
  symbols: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[],
  position: vscode.Position,
): vscode.Range | undefined {
  let best: vscode.Range | undefined;

  const visit = (
    list: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[],
  ): void => {
    for (const symbol of list) {
      const range = 'location' in symbol ? symbol.location.range : symbol.range;
      if (!range.contains(position)) {
        continue;
      }
      if (!best || lineSpan(range) < lineSpan(best)) {
        best = range;
      }
      const children = 'children' in symbol ? symbol.children : undefined;
      if (children && children.length > 0) {
        visit(children);
      }
    }
  };
  visit(symbols);

  return best;
}

function lineSpan(range: vscode.Range): number {
  return range.end.line - range.start.line;
}
