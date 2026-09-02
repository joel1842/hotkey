import OpenAI from 'openai';
import { log } from '../log';
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

export const OPENAI_INFO: ProviderInfo = {
  id: 'openai',
  label: 'OpenAI',
  defaultModel: 'gpt-5.5',
  apiKeyEnvVar: 'OPENAI_API_KEY',
  apiKeyPlaceholder: 'sk-...',
  apiKeyUrl: 'https://platform.openai.com/api-keys',
};

type StreamParams = Omit<OpenAI.Responses.ResponseCreateParamsNonStreaming, 'stream'>;

const TEXT_MODEL = /^(gpt|chatgpt|o[1-9])/i;
const NOT_TEXT_MODEL =
  /embedding|whisper|tts|dall-e|moderation|audio|image|realtime|transcribe|sora|search|davinci|babbage/i;

export class OpenAiProvider implements ModelProvider {
  readonly info = OPENAI_INFO;
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, maxRetries: 2 });
  }

  async streamReplacement(request: ReplacementRequest): Promise<string> {
    try {
      return await this.send(request, this.buildParams(request, true));
    } catch (error) {
      if (!isUnsupportedReasoningError(error)) {
        throw error;
      }
      log().warn(
        `${request.model} rejected the reasoning effort parameter; retrying without it. ${this.describeError(error)}`,
      );
      return this.send(request, this.buildParams(request, false));
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    const models: ProviderModel[] = [];
    for await (const model of this.client.models.list()) {
      if (!TEXT_MODEL.test(model.id) || NOT_TEXT_MODEL.test(model.id)) {
        continue;
      }
      models.push({
        id: model.id,
        label: model.id,
        detail: model.created
          ? `released ${new Date(model.created * 1000).toISOString().slice(0, 10)}`
          : undefined,
      });
    }
    return models.reverse();
  }

  describeError(error: unknown): string {
    if (error instanceof OpenAI.AuthenticationError) {
      return 'OpenAI rejected the API key. Run "Hotkey: Set API Key" with a valid key.';
    }
    if (error instanceof OpenAI.RateLimitError) {
      return 'Rate limited by OpenAI, or the account is out of quota. Check your billing and try again.';
    }
    if (error instanceof OpenAI.NotFoundError) {
      return `Model not found on OpenAI — ${error.message}`;
    }
    if (error instanceof OpenAI.BadRequestError) {
      return `OpenAI rejected the request: ${error.message}`;
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return `Could not reach OpenAI: ${error.message}`;
    }
    if (error instanceof OpenAI.APIError) {
      return `OpenAI error ${error.status ?? ''}: ${error.message}`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  isAbortError(error: unknown): boolean {
    return error instanceof OpenAI.APIUserAbortError;
  }

  private buildParams(
    request: ReplacementRequest,
    tuned: boolean,
  ): StreamParams {
    const params: StreamParams = {
      model: request.model,
      instructions: request.system,
      input: request.userContent,
      max_output_tokens: request.maxTokens,
      store: false,
    };

    const effort = reasoningEffort(request.effort);
    if (tuned && effort) {
      params.reasoning = { effort };
    }

    return params;
  }

  private async send(
    request: ReplacementRequest,
    params: StreamParams,
  ): Promise<string> {
    const stream = this.client.responses.stream(params, { signal: request.signal });
    if (request.onText) {
      const onText = request.onText;
      stream.on('response.output_text.delta', (event) => onText(event.delta));
    }

    const response = await stream.finalResponse();
    log().info(
      `openai ${params.model}: ${response.usage?.input_tokens ?? '?'} in / ${response.usage?.output_tokens ?? '?'} out, status=${response.status}`,
    );

    const refusal = findRefusal(response);
    if (refusal) {
      throw new RefusedResponseError(refusal);
    }
    if (response.status === 'failed') {
      throw new FailedResponseError(response.error?.message ?? 'no detail given');
    }
    if (
      response.status === 'incomplete' &&
      response.incomplete_details?.reason === 'max_output_tokens'
    ) {
      throw new TruncatedResponseError(params.max_output_tokens ?? request.maxTokens);
    }
    if (response.status === 'incomplete') {
      throw new FailedResponseError(
        `response was cut short (${response.incomplete_details?.reason ?? 'unknown reason'})`,
      );
    }

    return response.output_text;
  }
}

function reasoningEffort(effort: Effort): OpenAI.ReasoningEffort | undefined {
  return effort === 'default' ? undefined : effort;
}

function findRefusal(response: OpenAI.Responses.Response): string | undefined {
  for (const item of response.output) {
    if (item.type !== 'message') {
      continue;
    }
    for (const part of item.content) {
      if (part.type === 'refusal') {
        return part.refusal;
      }
    }
  }
  return undefined;
}

function isUnsupportedReasoningError(error: unknown): boolean {
  return (
    error instanceof OpenAI.BadRequestError && /reasoning|effort/i.test(error.message)
  );
}
