import * as vscode from 'vscode';
import { CONFIG_SECTION, readConfig } from './config';
import { providerInfo } from './providers';

export function createStatusBarItem(): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'hotkey.selectModel';

  const render = () => {
    const { provider, model } = readConfig();
    item.text = `$(sparkle) ${model}`;
    item.tooltip = `Hotkey: ${providerInfo(provider).label} · ${model} — click to change`;
    item.show();
  };
  render();

  const subscription = vscode.workspace.onDidChangeConfiguration((event) => {
    if (
      event.affectsConfiguration(`${CONFIG_SECTION}.model`) ||
      event.affectsConfiguration(`${CONFIG_SECTION}.models`) ||
      event.affectsConfiguration(`${CONFIG_SECTION}.provider`)
    ) {
      render();
    }
  });

  return vscode.Disposable.from(item, subscription);
}
