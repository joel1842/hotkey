import { ANTHROPIC_INFO, AnthropicProvider } from './anthropic';
import { GEMINI_INFO, GeminiProvider } from './gemini';
import { OPENAI_INFO, OpenAiProvider } from './openai';
import { ModelProvider, ProviderId, ProviderInfo } from './types';

export * from './types';

export const PROVIDERS: readonly ProviderInfo[] = [
  ANTHROPIC_INFO,
  OPENAI_INFO,
  GEMINI_INFO,
];

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((provider) => provider.id === id) ?? ANTHROPIC_INFO;
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDERS.some((provider) => provider.id === value);
}

const PROVIDER_CONSTRUCTORS: Record<
  ProviderId,
  new (apiKey: string) => ModelProvider
> = {
  anthropic: AnthropicProvider,
  openai: OpenAiProvider,
  gemini: GeminiProvider,
};

export function createProvider(id: ProviderId, apiKey: string): ModelProvider {
  return new PROVIDER_CONSTRUCTORS[id](apiKey);
}
