import * as vscode from 'vscode';

const TICK_MS = 100;
const TIMER_PRIORITY = 101;

export interface RequestTimer extends vscode.Disposable {
  report(characters: number): void;
  elapsed(): string;
}

/**
 * A ticking indicator in the status bar for the length of one request. It
 * counts on its own clock rather than off streamed deltas, so it keeps moving
 * during the silence before the first token.
 */
export function startRequestTimer(label: string): RequestTimer {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    TIMER_PRIORITY,
  );
  item.tooltip = 'Hotkey: request in progress — cancel from the notification';

  const startedAt = Date.now();
  let characters = 0;

  const elapsed = () => ((Date.now() - startedAt) / 1000).toFixed(1);

  const render = () => {
    const counted = characters > 0 ? ` · ${characters.toLocaleString()} chars` : '';
    item.text = `$(sync~spin) ${label} ${elapsed()}s${counted}`;
  };

  render();
  item.show();
  const interval = setInterval(render, TICK_MS);

  return {
    report: (count: number) => {
      characters = count;
    },
    elapsed,
    dispose: () => {
      clearInterval(interval);
      item.dispose();
    },
  };
}
