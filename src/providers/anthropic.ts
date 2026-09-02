import Anthropic from '@anthropic-ai/sdk';
import { log } from '../log';
import { formatTokens } from './tokens';
import {
  ModelProvider,
  ProviderInfo,
  ProviderModel,
  RefusedResponseError,
  ReplacementRequest,
  TruncatedResponseError,
} from './types';

export const ANTHROPIC_INFO: ProviderInfo = {
  id: 'anthropic',
  label: 'Anthropic',
  defaultModel: 'claude-opus-5',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  apiKeyPlaceholder: 'sk-ant-...',
  apiKeyUrl: 'https://console.anthropic.com/settings/keys',
};

export class AnthropicProvider implements ModelProvider {
  readonly info = ANTHROPIC_INFO;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async streamReplacement(request: ReplacementRequest): Promise<string> {
    try {
      return await this.send(request, this.buildParams(request, true));
    } catch (error) {
      if (!isUnsupportedTuningError(error)) {
        throw error;
      }
      log().warn(
        `${request.model} rejected the thinking/effort parameters; retrying without them. ${this.describeError(error)}`,
      );
      return this.send(request, this.buildParams(request, false));
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    const models: ProviderModel[] = [];
    for await (const model of this.client.models.list({ limit: 100 })) {
      models.push({
        id: model.id,
        label: model.display_name ?? model.id,
        detail: describeLimits(model),
      });
    }
    return models;
  }

  describeError(error: unknown): string {
    if (error instanceof Anthropic.AuthenticationError) {
      return 'Anthropic rejected the API key. Run "Hotkey: Set API Key" with a valid key.';
    }
    if (error instanceof Anthropic.RateLimitError) {
      return 'Rate limited by Anthropic. Wait a moment and try again.';
    }
    if (error instanceof Anthropic.NotFoundError) {
      return `Model not found on Anthropic — ${error.message}`;
    }
    if (error instanceof Anthropic.BadRequestError) {
      return `Anthropic rejected the request: ${error.message}`;
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return `Could not reach Anthropic: ${error.message}`;
    }
    if (error instanceof Anthropic.APIError) {
      return `Anthropic error ${error.status ?? ''}: ${error.message}`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  isAbortError(error: unknown): boolean {
    return error instanceof Anthropic.APIUserAbortError;
  }

  private buildParams(
    request: ReplacementRequest,
    tuned: boolean,
  ): Anthropic.MessageStreamParams {
    const params: Anthropic.MessageStreamParams = {
      model: request.model,
      max_tokens: request.maxTokens,
      system: [
        { type: 'text', text: request.system, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: request.userContent }],
    };

    if (tuned) {
      if (request.adaptiveThinking) {
        params.thinking = { type: 'adaptive' };
      }
      if (request.effort !== 'default') {
        params.output_config = { effort: request.effort };
      }
    }

    return params;
  }

  private async send(
    request: ReplacementRequest,
    params: Anthropic.MessageStreamParams,
  ): Promise<string> {
    const stream = this.client.messages.stream(params, { signal: request.signal });
    if (request.onText) {
      stream.on('text', request.onText);
    }

    const message = await stream.finalMessage();
    log().info(
      `anthropic ${params.model}: ${message.usage.input_tokens} in / ${message.usage.output_tokens} out, stop_reason=${message.stop_reason}`,
    );

    if (message.stop_reason === 'refusal') {
      const details = message.stop_details;
      throw new RefusedResponseError(
        `${details?.category ?? 'unspecified'} — ${details?.explanation ?? 'no explanation given'}`,
      );
    }
    if (message.stop_reason === 'max_tokens') {
      throw new TruncatedResponseError(params.max_tokens);
    }

    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }
}

function describeLimits(model: Anthropic.ModelInfo): string | undefined {
  const parts: string[] = [];
  if (model.max_input_tokens) {
    parts.push(`${formatTokens(model.max_input_tokens)} context`);
  }
  if (model.max_tokens) {
    parts.push(`${formatTokens(model.max_tokens)} max output`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function isUnsupportedTuningError(error: unknown): boolean {
  return (
    error instanceof Anthropic.BadRequestError &&
    /thinking|effort|budget_tokens|output_config/i.test(error.message)
  );
}
