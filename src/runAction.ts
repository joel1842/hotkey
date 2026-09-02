import * as vscode from 'vscode';
import { ActionContext, EditPlan, HotkeyAction, RangeSource, isNoChange } from './actions';
import { resolveApiKey } from './apiKey';
import { HotkeyConfig, readConfig } from './config';
import { log, stream } from './log';
import { ModelProvider, createProvider } from './providers';
import { startRequestTimer } from './requestTimer';

const PROGRESS_THROTTLE_MS = 200;
const RULE = '────────';
const MAX_SIBLINGS = 60;

export async function runAction(
  extensionContext: vscode.ExtensionContext,
  action: HotkeyAction,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Hotkey: open a file first.');
    return;
  }

  const config = readConfig();
  const context = await buildActionContext(editor, action, config);
  if (context.selectionText.trim().length === 0) {
    vscode.window.showWarningMessage(`Hotkey: ${action.emptySelectionHint}`);
    return;
  }

  const apiKey = await resolveApiKey(extensionContext.secrets, config.provider);
  if (!apiKey) {
    return;
  }

  const provider = createProvider(config.provider, apiKey);
  const versionBeforeRequest = editor.document.version;
  const response = await streamResponse(provider, action, context, config);
  if (response === undefined) {
    return;
  }

  let outcome;
  try {
    outcome = action.plan(response, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log().error(`${action.id}: ${message}`);
    log().info(`${action.id} raw response:\n${response}`);
    showError(message);
    return;
  }

  if (outcome.notes) {
    log().info(`${action.id} notes:\n${outcome.notes}`);
  }

  if (isNoChange(outcome)) {
    showOutcome(outcome.reason, Boolean(outcome.notes));
    return;
  }

  if (!(await confirmDocumentUnchanged(editor.document, versionBeforeRequest))) {
    return;
  }

  await applyPlan(outcome);
}

async function buildActionContext(
  editor: vscode.TextEditor,
  action: HotkeyAction,
  config: HotkeyConfig,
): Promise<ActionContext> {
  const { document } = editor;
  const { range, rangeSource } = await resolveRange(editor, action);

  return {
    document,
    range,
    selectionText: document.getText(range),
    rangeSource,
    siblingFiles: await readSiblingFiles(document.uri),
    config,
  };
}

async function resolveRange(
  editor: vscode.TextEditor,
  action: HotkeyAction,
): Promise<{ range: vscode.Range; rangeSource: RangeSource }> {
  const { document, selection } = editor;
  if (!selection.isEmpty) {
    return {
      range: new vscode.Range(selection.start, selection.end),
      rangeSource: 'selection',
    };
  }

  const widened = await action.widenFromCursor?.(document, selection.active);
  if (widened) {
    return { range: widened, rangeSource: 'symbol' };
  }

  return { range: document.lineAt(selection.active.line).range, rangeSource: 'line' };
}

async function readSiblingFiles(uri: vscode.Uri): Promise<string[]> {
  try {
    const directory = vscode.Uri.joinPath(uri, '..');
    const entries = await vscode.workspace.fs.readDirectory(directory);
    return entries
      .filter(([, type]) => type === vscode.FileType.File)
      .map(([name]) => name)
      .slice(0, MAX_SIBLINGS);
  } catch (error) {
    log().warn(`Could not list sibling files: ${String(error)}`);
    return [];
  }
}

async function streamResponse(
  provider: ModelProvider,
  action: HotkeyAction,
  context: ActionContext,
  config: HotkeyConfig,
): Promise<string | undefined> {
  const { system, user } = action.buildPrompt(context);
  const output = stream();
  openStreamWithHeader(output, provider, action, context, config);

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Hotkey · ${action.label} · ${config.model}`,
      cancellable: true,
    },
    async (progress, token) => {
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      const timer = startRequestTimer(action.label);

      let characters = 0;
      let lastReport = 0;
      const onText = (delta: string) => {
        characters += delta.length;
        output.append(delta);
        timer.report(characters);

        const now = Date.now();
        if (now - lastReport > PROGRESS_THROTTLE_MS) {
          lastReport = now;
          progress.report({ message: `${characters.toLocaleString()} characters` });
        }
      };

      try {
        const response = await provider.streamReplacement({
          system,
          userContent: user,
          model: config.model,
          maxTokens: config.maxTokens,
          effort: config.effort,
          adaptiveThinking: config.adaptiveThinking,
          signal: controller.signal,
          onText,
        });
        output.appendLine(
          `\n${RULE} done in ${timer.elapsed()}s · ${characters.toLocaleString()} characters ${RULE}`,
        );
        return response;
      } catch (error) {
        if (provider.isAbortError(error) || token.isCancellationRequested) {
          log().info(`${action.id}: request cancelled.`);
          output.appendLine(`\n${RULE} cancelled after ${timer.elapsed()}s ${RULE}`);
          return undefined;
        }
        const message = provider.describeError(error);
        log().error(`${action.id}: ${message}`);
        output.appendLine(`\n${RULE} failed after ${timer.elapsed()}s: ${message} ${RULE}`);
        showError(message);
        return undefined;
      } finally {
        timer.dispose();
      }
    },
  );
}

function openStreamWithHeader(
  output: vscode.OutputChannel,
  provider: ModelProvider,
  action: HotkeyAction,
  context: ActionContext,
  config: HotkeyConfig,
): void {
  const { range, document } = context;
  const where = `${vscode.workspace.asRelativePath(document.uri)}:${range.start.line + 1}-${range.end.line + 1}`;
  const when = new Date().toLocaleTimeString();

  output.appendLine('');
  output.appendLine(
    `${RULE} ${action.label} · ${provider.info.label} ${config.model} · ${where} · ${when} ${RULE}`,
  );
  output.show(true);
}

async function confirmDocumentUnchanged(
  document: vscode.TextDocument,
  versionBeforeRequest: number,
): Promise<boolean> {
  if (document.version === versionBeforeRequest) {
    return true;
  }
  const choice = await vscode.window.showWarningMessage(
    'Hotkey: the file changed while the model was working.',
    { modal: true, detail: 'Applying now may overwrite what you just typed.' },
    'Apply anyway',
  );
  return choice === 'Apply anyway';
}

async function applyPlan(plan: EditPlan): Promise<void> {
  for (const file of plan.newFiles) {
    if (!(await confirmOverwrite(file.uri))) {
      return;
    }
  }

  const edit = new vscode.WorkspaceEdit();
  for (const file of plan.newFiles) {
    edit.createFile(file.uri, {
      overwrite: true,
      contents: new TextEncoder().encode(file.contents),
    });
  }
  for (const { uri, range, text } of plan.edits) {
    edit.replace(uri, range, text);
  }

  if (!(await vscode.workspace.applyEdit(edit))) {
    vscode.window.showErrorMessage('Hotkey: the edit could not be applied.');
    return;
  }

  showOutcome(plan.summary, Boolean(plan.notes));
  if (plan.openFile) {
    await vscode.window.showTextDocument(plan.openFile, { preview: false });
  }
}

async function confirmOverwrite(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    `Hotkey: ${vscode.workspace.asRelativePath(uri)} already exists.`,
    { modal: true, detail: 'Overwrite it with the extracted code?' },
    'Overwrite',
  );
  return choice === 'Overwrite';
}

function showOutcome(summary: string, hasNotes: boolean): void {
  if (!hasNotes) {
    vscode.window.showInformationMessage(`Hotkey: ${summary}.`);
    return;
  }
  vscode.window
    .showInformationMessage(`Hotkey: ${summary} — with notes.`, 'Show Log')
    .then((choice) => {
      if (choice === 'Show Log') {
        log().show();
      }
    });
}

function showError(message: string): void {
  vscode.window.showErrorMessage(`Hotkey: ${message}`, 'Show Log').then((choice) => {
    if (choice === 'Show Log') {
      log().show();
    }
  });
}
