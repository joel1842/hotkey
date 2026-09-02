import { ANTHROPIC_INFO, AnthropicProvider } from './anthropic';
import { OPENAI_INFO, OpenAiProvider } from './openai';
import { ModelProvider, ProviderId, ProviderInfo } from './types';

export * from './types';

export const PROVIDERS: readonly ProviderInfo[] = [ANTHROPIC_INFO, OPENAI_INFO];

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((provider) => provider.id === id) ?? ANTHROPIC_INFO;
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDERS.some((provider) => provider.id === value);
}

export function createProvider(id: ProviderId, apiKey: string): ModelProvider {
  return id === 'openai' ? new OpenAiProvider(apiKey) : new AnthropicProvider(apiKey);
}
