import * as vscode from 'vscode';
import { pickProvider, resolveApiKey } from './apiKey';
import { readConfig, readModelFor, writeModel, writeProvider } from './config';
import { log } from './log';
import { ProviderId, createProvider, providerInfo } from './providers';

const MANUAL_ENTRY = 'Enter a model ID manually…';
const SWITCH_PROVIDER = 'Switch provider…';

export async function selectProvider(context: vscode.ExtensionContext): Promise<void> {
  const { provider: current } = readConfig();
  const picked = await pickProvider(
    context.secrets,
    current,
    'Which API should Hotkey call?',
  );
  if (!picked || picked === current) {
    return;
  }

  await writeProvider(picked);
  const info = providerInfo(picked);
  const model = readModelFor(picked);
  vscode.window.showInformationMessage(`Hotkey: now using ${info.label} · ${model}.`);

  if (!(await resolveApiKey(context.secrets, picked, { promptIfMissing: false }))) {
    await resolveApiKey(context.secrets, picked);
  }
}

export async function selectModel(context: vscode.ExtensionContext): Promise<void> {
  const { provider, model: current } = readConfig();
  const info = providerInfo(provider);
  const apiKey = await resolveApiKey(context.secrets, provider, {
    promptIfMissing: false,
  });
  const items = apiKey ? await fetchModelItems(provider, apiKey, current) : [];

  const picked = await vscode.window.showQuickPick(
    [
      { label: MANUAL_ENTRY, alwaysShow: true },
      { label: SWITCH_PROVIDER, description: info.label, alwaysShow: true },
      ...items,
    ],
    {
      title: `Hotkey: ${info.label} model`,
      placeHolder: apiKey
        ? `Current: ${current}`
        : `Current: ${current} — set an API key to list available models`,
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!picked) {
    return;
  }
  if (picked.label === SWITCH_PROVIDER) {
    await selectProvider(context);
    return;
  }

  const model =
    picked.label === MANUAL_ENTRY
      ? await promptForModelId(info.label, current)
      : picked.description;
  if (!model) {
    return;
  }

  await writeModel(provider, model);
  vscode.window.showInformationMessage(`Hotkey: now using ${info.label} · ${model}.`);
}

async function fetchModelItems(
  provider: ProviderId,
  apiKey: string,
  current: string,
): Promise<vscode.QuickPickItem[]> {
  try {
    const models = await createProvider(provider, apiKey).listModels();
    return models.map((model) => ({
      label: model.label,
      description: model.id,
      detail: model.detail,
      picked: model.id === current,
    }));
  } catch (error) {
    const message = createProvider(provider, apiKey).describeError(error);
    log().warn(`Could not list models: ${message}`);
    vscode.window.showWarningMessage(`Hotkey: could not list models — ${message}`);
    return [];
  }
}

async function promptForModelId(
  providerLabel: string,
  current: string,
): Promise<string | undefined> {
  const entered = await vscode.window.showInputBox({
    title: `Hotkey: ${providerLabel} model ID`,
    prompt: 'Exact model ID as the API expects it',
    value: current,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length === 0
        ? 'Enter a model ID, or press Escape to cancel.'
        : undefined,
  });
  return entered?.trim() || undefined;
}
