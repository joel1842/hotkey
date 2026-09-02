import {
  ApiError,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
  Model,
  ThinkingLevel,
} from '@google/genai';
import { log } from '../log';
import { formatTokens } from './tokens';
import {
  Effort,
  FailedResponseError,
  ModelProvider,
  ProviderInfo,
  ProviderModel,
  RefusedResponseError,
  ReplacementRequest,
  TruncatedResponseError,
} from './types';

export const GEMINI_INFO: ProviderInfo = {
  id: 'gemini',
  label: 'Gemini',
  defaultModel: 'gemini-pro-latest',
  apiKeyEnvVar: 'GEMINI_API_KEY',
  apiKeyPlaceholder: 'AIza...',
  apiKeyUrl: 'https://aistudio.google.com/apikey',
};

const GENERATE_CONTENT_ACTION = 'generateContent';
const MODEL_NAME_PREFIX = /^models\//;
const MODELS_PER_PAGE = 100;
const RETRY_ATTEMPTS = 3;

const THINKING_LEVELS: Record<Exclude<Effort, 'default'>, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
  xhigh: ThinkingLevel.HIGH,
  max: ThinkingLevel.HIGH,
};

const REFUSAL_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
]);

export class GeminiProvider implements ModelProvider {
  readonly info = GEMINI_INFO;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { retryOptions: { attempts: RETRY_ATTEMPTS } },
    });
  }

  async streamReplacement(request: ReplacementRequest): Promise<string> {
    try {
      return await this.send(request, this.buildParams(request, true));
    } catch (error) {
      if (!isUnsupportedThinkingError(error)) {
        throw error;
      }
      log().warn(
        `${request.model} rejected the thinking level parameter; retrying without it. ${this.describeError(error)}`,
      );
      return this.send(request, this.buildParams(request, false));
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    const pager = await this.client.models.list({
      config: { pageSize: MODELS_PER_PAGE, queryBase: true },
    });

    const models: ProviderModel[] = [];
    for await (const model of pager) {
      const id = model.name?.replace(MODEL_NAME_PREFIX, '');
      if (!id || !model.supportedActions?.includes(GENERATE_CONTENT_ACTION)) {
        continue;
      }
      models.push({
        id,
        label: model.displayName?.trim() || id,
        detail: describeLimits(model),
      });
    }
    return models;
  }

  describeError(error: unknown): string {
    if (!(error instanceof ApiError)) {
      return error instanceof Error ? error.message : String(error);
    }
    if (error.status === 401 || error.status === 403) {
      return 'Google rejected the API key. Run "Hotkey: Set API Key" with a valid key.';
    }
    if (error.status === 429) {
      return 'Rate limited by Google, or the key is out of quota. Check your plan and try again.';
    }
    if (error.status === 404) {
      return `Model not found on Gemini — ${error.message}`;
    }
    if (error.status === 400) {
      return `Gemini rejected the request: ${error.message}`;
    }
    return `Gemini error ${error.status}: ${error.message}`;
  }

  isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  private buildParams(
    request: ReplacementRequest,
    tuned: boolean,
  ): GenerateContentParameters {
    const params: GenerateContentParameters = {
      model: request.model,
      contents: request.userContent,
      config: {
        systemInstruction: request.system,
        maxOutputTokens: request.maxTokens,
        abortSignal: request.signal,
      },
    };

    if (tuned && request.effort !== 'default') {
      params.config = {
        ...params.config,
        thinkingConfig: { thinkingLevel: THINKING_LEVELS[request.effort] },
      };
    }

    return params;
  }

  private async send(
    request: ReplacementRequest,
    params: GenerateContentParameters,
  ): Promise<string> {
    const stream = await this.client.models.generateContentStream(params);

    let text = '';
    let last: GenerateContentResponse | undefined;
    for await (const chunk of stream) {
      last = chunk;
      const delta = chunk.text;
      if (delta) {
        text += delta;
        request.onText?.(delta);
      }
    }

    const usage = last?.usageMetadata;
    const finishReason = last?.candidates?.[0]?.finishReason;
    log().info(
      `gemini ${params.model}: ${usage?.promptTokenCount ?? '?'} in / ${usage?.candidatesTokenCount ?? '?'} out, finish_reason=${finishReason ?? 'none'}`,
    );

    const blocked = last?.promptFeedback;
    if (blocked?.blockReason) {
      throw new RefusedResponseError(
        `${blocked.blockReason} — ${blocked.blockReasonMessage ?? 'no explanation given'}`,
      );
    }
    if (finishReason && REFUSAL_REASONS.has(finishReason)) {
      throw new RefusedResponseError(
        `${finishReason} — ${last?.candidates?.[0]?.finishMessage ?? 'no explanation given'}`,
      );
    }
    if (finishReason === 'MAX_TOKENS') {
      throw new TruncatedResponseError(request.maxTokens);
    }
    if (text.length === 0) {
      throw new FailedResponseError(
        `the model returned no text (finish reason ${finishReason ?? 'unknown'})`,
      );
    }

    return text;
  }
}

function describeLimits(model: Model): string | undefined {
  const parts: string[] = [];
  if (model.inputTokenLimit) {
    parts.push(`${formatTokens(model.inputTokenLimit)} context`);
  }
  if (model.outputTokenLimit) {
    parts.push(`${formatTokens(model.outputTokenLimit)} max output`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function isUnsupportedThinkingError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    /thinking|thought/i.test(error.message)
  );
}
