export type ProviderId = 'anthropic' | 'openai' | 'gemini';

export type Effort = 'default' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ProviderInfo {
  readonly id: ProviderId;
  readonly label: string;
  readonly defaultModel: string;
  readonly apiKeyEnvVar: string;
  readonly apiKeyPlaceholder: string;
  readonly apiKeyUrl: string;
}

export interface ProviderModel {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
}

export interface ReplacementRequest {
  readonly system: string;
  readonly userContent: string;
  readonly model: string;
  readonly maxTokens: number;
  readonly effort: Effort;
  readonly adaptiveThinking: boolean;
  readonly signal: AbortSignal;
  readonly onText?: (delta: string) => void;
}

export interface ModelProvider {
  readonly info: ProviderInfo;
  streamReplacement(request: ReplacementRequest): Promise<string>;
  listModels(): Promise<ProviderModel[]>;
  describeError(error: unknown): string;
  isAbortError(error: unknown): boolean;
}

export class TruncatedResponseError extends Error {
  constructor(limit: number) {
    super(
      `The model hit the ${limit}-token ceiling before finishing, so the edit was not applied. Raise "hotkey.maxTokens" or select a smaller region.`,
    );
  }
}

export class RefusedResponseError extends Error {
  constructor(detail: string) {
    super(`The model declined this request: ${detail}`);
  }
}

export class FailedResponseError extends Error {
  constructor(detail: string) {
    super(`The model reported a failure: ${detail}`);
  }
}
