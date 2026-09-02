import * as vscode from 'vscode';
import { log } from './log';
import { PROVIDERS, ProviderId, providerInfo } from './providers';

const LEGACY_SECRET_KEY = 'hotkey.anthropicApiKey';

function secretKey(provider: ProviderId): string {
  return `hotkey.apiKey.${provider}`;
}

export async function resolveApiKey(
  secrets: vscode.SecretStorage,
  provider: ProviderId,
  { promptIfMissing = true } = {},
): Promise<string | undefined> {
  const stored = await secrets.get(secretKey(provider));
  if (stored) {
    return stored;
  }

  const info = providerInfo(provider);
  const fromEnvironment = process.env[info.apiKeyEnvVar];
  if (fromEnvironment) {
    log().info(`Using ${info.apiKeyEnvVar} from the environment for ${info.label}.`);
    return fromEnvironment;
  }

  if (!promptIfMissing) {
    return undefined;
  }
  return promptForApiKey(secrets, provider);
}

export async function promptForApiKey(
  secrets: vscode.SecretStorage,
  provider: ProviderId,
): Promise<string | undefined> {
  const info = providerInfo(provider);
  const key = await vscode.window.showInputBox({
    title: `${info.label} API key`,
    prompt: `Stored in VS Code SecretStorage, never in your settings file. Keys: ${info.apiKeyUrl}`,
    placeHolder: info.apiKeyPlaceholder,
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length === 0 ? 'Enter a key, or press Escape to cancel.' : undefined,
  });

  if (!key) {
    return undefined;
  }

  const trimmed = key.trim();
  await secrets.store(secretKey(provider), trimmed);
  vscode.window.showInformationMessage(`Hotkey: ${info.label} API key saved.`);
  return trimmed;
}

export async function clearApiKey(
  secrets: vscode.SecretStorage,
  provider: ProviderId,
): Promise<void> {
  await secrets.delete(secretKey(provider));
  vscode.window.showInformationMessage(
    `Hotkey: ${providerInfo(provider).label} API key removed.`,
  );
}

export async function hasStoredKey(
  secrets: vscode.SecretStorage,
  provider: ProviderId,
): Promise<boolean> {
  if (await secrets.get(secretKey(provider))) {
    return true;
  }
  return Boolean(process.env[providerInfo(provider).apiKeyEnvVar]);
}

export async function migrateLegacyKey(secrets: vscode.SecretStorage): Promise<void> {
  const legacy = await secrets.get(LEGACY_SECRET_KEY);
  if (!legacy) {
    return;
  }
  if (!(await secrets.get(secretKey('anthropic')))) {
    await secrets.store(secretKey('anthropic'), legacy);
    log().info('Migrated the stored Anthropic key to the per-provider secret.');
  }
  await secrets.delete(LEGACY_SECRET_KEY);
}

export async function pickProvider(
  secrets: vscode.SecretStorage,
  current: ProviderId,
  placeHolder: string,
): Promise<ProviderId | undefined> {
  const items = await Promise.all(
    PROVIDERS.map(async (info) => ({
      label: info.label,
      description: info.id === current ? 'current' : undefined,
      detail: (await hasStoredKey(secrets, info.id))
        ? 'API key configured'
        : 'no API key yet',
      id: info.id,
    })),
  );

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Hotkey: provider',
    placeHolder,
    matchOnDetail: true,
  });
  return picked?.id;
}
