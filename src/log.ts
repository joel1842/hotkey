import * as vscode from 'vscode';

let logChannel: vscode.LogOutputChannel | undefined;
let streamChannel: vscode.OutputChannel | undefined;

export function log(): vscode.LogOutputChannel {
  logChannel ??= vscode.window.createOutputChannel('Hotkey', { log: true });
  return logChannel;
}

/**
 * Raw model output, appended delta by delta. Deliberately not a
 * LogOutputChannel: that one stamps every append with a timestamp and level,
 * which turns streamed tokens into confetti.
 */
export function stream(): vscode.OutputChannel {
  streamChannel ??= vscode.window.createOutputChannel('Hotkey Output');
  return streamChannel;
}
