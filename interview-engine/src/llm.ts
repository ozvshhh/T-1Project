import { z } from 'zod';

export type LlmErrorCode =
  | 'no_key'
  | 'auth'
  | 'budget'
  | 'rate_limit'
  | 'timeout'
  | 'upstream'
  | 'bad_response';

/** 사용자에게 보여 줄 안내 문구. 키 값이나 응답 본문은 담지 않는다. */
export const LLM_ERROR_MESSAGE: Record<LlmErrorCode, string> = {
  no_key: 'AI 키가 설정되지 않아 기본 질문으로 진행해요.',
  auth: 'AI 키가 거절되었어요. 키 설정을 확인해 주세요.',
  budget: 'AI 사용 예산이 부족해요.',
  rate_limit: 'AI 요청이 몰려 잠시 쉬어야 해요. 조금 뒤 다시 시도해 주세요.',
  timeout: 'AI 응답이 늦어요. 다시 시도해 주세요.',
  upstream: 'AI 서버에 연결하지 못했어요. 다시 시도해 주세요.',
  bad_response: 'AI 응답 형식이 올바르지 않았어요.',
};

export class LlmError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    message: string = LLM_ERROR_MESSAGE[code],
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface JsonRequest<T> {
  system: string;
  user: string;
  schemaName: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}

/** 엔진이 쓰는 AI 호출 창구. 테스트에서는 가짜 구현으로 바꿔 끼운다. */
export interface LlmClient {
  json<T>(req: JsonRequest<T>): Promise<T>;
}

export interface GatewayOptions {
  /** Gateway 모델 ID. 공식 목록(GET {baseUrl}/models)에서 확인한 값을 넣는다. */
  model: string;
  /** 비우면 환경변수 AI_GATEWAY_API_KEY를 읽는다. */
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** response_format의 strict. 모델이 strict 스키마를 거절하면 false로 바꾼다. */
  strictSchema?: boolean;
  fetchImpl?: typeof fetch;
}

export const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

/**
 * Vercel AI Gateway의 OpenAI 호환 Chat Completions API 호출.
 * https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions
 * 서버에서만 쓴다. 키를 브라우저로 보내지 않는다.
 */
export class GatewayLlmClient implements LlmClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly strict: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GatewayOptions) {
    if (!opts.model) throw new Error('GatewayLlmClient: model이 필요합니다.');
    this.apiKey = opts.apiKey ?? process.env.AI_GATEWAY_API_KEY ?? '';
    this.model = opts.model;
    this.baseUrl = (opts.baseUrl ?? GATEWAY_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.strict = opts.strictSchema ?? true;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async json<T>(req: JsonRequest<T>): Promise<T> {
    if (!this.apiKey) throw new LlmError('no_key');

    const jsonSchema = z.toJSONSchema(req.schema) as Record<string, unknown>;
    delete jsonSchema.$schema;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let body: unknown;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: req.schemaName, strict: this.strict, schema: jsonSchema },
          },
          max_tokens: req.maxTokens ?? 1200,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new LlmError(codeForStatus(res.status));
      body = await res.json();
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if (controller.signal.aborted) throw new LlmError('timeout');
      throw new LlmError('upstream');
    } finally {
      clearTimeout(timer);
    }

    const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
      ?.message?.content;
    if (typeof content !== 'string') throw new LlmError('bad_response');

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(content));
    } catch {
      throw new LlmError('bad_response');
    }
    const result = req.schema.safeParse(parsed);
    if (!result.success) throw new LlmError('bad_response');
    return result.data;
  }
}

function codeForStatus(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'budget';
  if (status === 429) return 'rate_limit';
  return 'upstream';
}

function stripCodeFence(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return m?.[1] ?? t;
}
