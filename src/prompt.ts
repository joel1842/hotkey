import * as vscode from 'vscode';
import { ActionContext, RangeSource } from './actions/types';

const MAX_DIAGNOSTICS = 30;
const SEVERITY_NAMES = ['error', 'warning', 'info', 'hint'];

export function houseRules(context: ActionContext): string {
  const suffix = context.config.systemPromptSuffix.trim();
  return suffix ? `\n\nAdditional house rules from the developer:\n${suffix}` : '';
}

export function fileSection(context: ActionContext): string {
  const { document } = context;
  return [
    `--- FILE: ${vscode.workspace.asRelativePath(document.uri)} (${document.languageId}) ---`,
    document.getText(),
    '--- END FILE ---',
  ].join('\n');
}

const REGION_LABELS: Record<RangeSource, string> = {
  selection: 'REGION THE DEVELOPER SELECTED',
  symbol: 'CONSTRUCT THE CURSOR IS INSIDE',
  line: 'LINE THE CURSOR IS ON',
};

export function selectionSection(context: ActionContext): string {
  const { range, selectionText, rangeSource } = context;
  const lines =
    range.start.line === range.end.line
      ? `line ${range.start.line + 1}`
      : `lines ${range.start.line + 1}-${range.end.line + 1}`;
  return [
    `--- ${REGION_LABELS[rangeSource]} (${lines}) ---`,
    selectionText,
    '--- END REGION ---',
  ].join('\n');
}

export function diagnosticsSection(
  context: ActionContext,
  { wholeFile = false } = {},
): string {
  if (!context.config.includeDiagnostics) {
    return '';
  }

  const all = vscode.languages.getDiagnostics(context.document.uri);
  const relevant = wholeFile
    ? all
    : all.filter((diagnostic) => Boolean(diagnostic.range.intersection(context.range)));
  if (relevant.length === 0) {
    return '';
  }

  const rendered = relevant
    .slice(0, MAX_DIAGNOSTICS)
    .map(
      (diagnostic) =>
        `- [${SEVERITY_NAMES[diagnostic.severity]}] line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`,
    );
  const scope = wholeFile ? 'in this file' : 'in this region';
  return [`--- DIAGNOSTICS ${scope.toUpperCase()} ---`, ...rendered, '--- END DIAGNOSTICS ---'].join(
    '\n',
  );
}

export function joinSections(...sections: string[]): string {
  return sections.filter((section) => section.length > 0).join('\n\n');
}
