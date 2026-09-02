import * as vscode from 'vscode';
import { Effort, ProviderId, isProviderId, providerInfo } from './providers';

export const CONFIG_SECTION = 'hotkey';

export interface HotkeyConfig {
  provider: ProviderId;
  model: string;
  effort: Effort;
  adaptiveThinking: boolean;
  maxTokens: number;
  includeDiagnostics: boolean;
  systemPromptSuffix: string;
}

export function readConfig(): HotkeyConfig {
  const settings = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const provider = readProvider(settings);
  return {
    provider,
    model: readModel(settings, provider),
    effort: settings.get<Effort>('effort', 'high'),
    adaptiveThinking: settings.get<boolean>('adaptiveThinking', true),
    maxTokens: settings.get<number>('maxTokens', 64000),
    includeDiagnostics: settings.get<boolean>('includeDiagnostics', true),
    systemPromptSuffix: settings.get<string>('systemPromptSuffix', ''),
  };
}

export function readModelFor(provider: ProviderId): string {
  return readModel(vscode.workspace.getConfiguration(CONFIG_SECTION), provider);
}

export async function writeProvider(provider: ProviderId): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update('provider', provider, vscode.ConfigurationTarget.Global);
}

export async function writeModel(provider: ProviderId, model: string): Promise<void> {
  const settings = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const models = settings.get<Record<string, string>>('models', {});
  await settings.update(
    'models',
    { ...models, [provider]: model },
    vscode.ConfigurationTarget.Global,
  );
}

function readProvider(settings: vscode.WorkspaceConfiguration): ProviderId {
  const configured = settings.get<string>('provider', 'anthropic');
  return isProviderId(configured) ? configured : 'anthropic';
}

function readModel(
  settings: vscode.WorkspaceConfiguration,
  provider: ProviderId,
): string {
  const models = settings.get<Record<string, string>>('models', {});
  return (models[provider] ?? '').trim() || providerInfo(provider).defaultModel;
}
