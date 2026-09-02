import * as vscode from 'vscode';
import {
  breakoutAction,
  importAction,
  scaffoldAction,
  uncleBobifyAction,
  wireAction,
} from './actions';
import { clearApiKey, migrateLegacyKey, pickProvider, promptForApiKey } from './apiKey';
import { readConfig } from './config';
import { log, stream } from './log';
import { runAction } from './runAction';
import { selectModel, selectProvider } from './selectModel';
import { createStatusBarItem } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  void migrateLegacyKey(context.secrets);

  context.subscriptions.push(
    log(),
    stream(),
    createStatusBarItem(),
    vscode.commands.registerCommand('hotkey.scaffold', () => runAction(context, scaffoldAction)),
    vscode.commands.registerCommand('hotkey.import', () => runAction(context, importAction)),
    vscode.commands.registerCommand('hotkey.wire', () => runAction(context, wireAction)),
    vscode.commands.registerCommand('hotkey.breakout', () => runAction(context, breakoutAction)),
    vscode.commands.registerCommand('hotkey.uncleBobify', () => runAction(context, uncleBobifyAction)),
    vscode.commands.registerCommand('hotkey.selectModel', () => selectModel(context)),
    vscode.commands.registerCommand('hotkey.selectProvider', () => selectProvider(context)),
    vscode.commands.registerCommand('hotkey.setApiKey', () => setApiKey(context)),
    vscode.commands.registerCommand('hotkey.clearApiKey', () => removeApiKey(context)),
    vscode.commands.registerCommand('hotkey.showLog', () => log().show()),
    vscode.commands.registerCommand('hotkey.showOutput', () => stream().show()),
  );
}

export function deactivate(): void {}

async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
  const provider = await pickProvider(
    context.secrets,
    readConfig().provider,
    'Set the API key for which provider?',
  );
  if (provider) {
    await promptForApiKey(context.secrets, provider);
  }
}

async function removeApiKey(context: vscode.ExtensionContext): Promise<void> {
  const provider = await pickProvider(
    context.secrets,
    readConfig().provider,
    'Clear the API key for which provider?',
  );
  if (provider) {
    await clearApiKey(context.secrets, provider);
  }
}
