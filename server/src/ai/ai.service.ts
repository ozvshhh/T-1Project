import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AiUnavailableError } from './ai-unavailable.error';
import { AI_MAX_RETRIES, aiConfigFromEnv } from './ai.config';

export interface AiJsonRequest<T> {
  // 로그·테스트 가짜에서 호출을 구분하는 이름(예: 'coverletter-feedback').
  task: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

// 한 번 시도의 결과. 다시 불러 나아질 수 있는 실패(네트워크·타임아웃·5xx·형식 오류)만 retryable이다.
type Attempt<T> = { ok: true; value: T } | { ok: false; retryable: boolean };

const RETRYABLE: Attempt<never> = { ok: false, retryable: true };
const FINAL: Attempt<never> = { ok: false, retryable: false };

// Vercel AI Gateway(OpenAI 호환)에 JSON 한 번을 요청한다(api.md 0절: 스트리밍 없음).
// AI 응답은 믿지 않으므로 zod로 검증한 값만 돌려준다.
@Injectable()
export class AiService {
  async json<T>(req: AiJsonRequest<T>): Promise<T> {
    // 키는 대회 규칙상 이 환경변수에서만 읽는다. 비면 네트워크 없이 바로 실패한다.
    const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
    if (!apiKey) throw new AiUnavailableError();

    const { baseUrl, model, timeoutMs } = aiConfigFromEnv();
    const jsonSchema = z.toJSONSchema(req.schema) as Record<string, unknown>;
    delete jsonSchema.$schema;
    const payload = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: req.task, strict: true, schema: jsonSchema },
      },
    });

    // 재시도 상한을 둬야 장애 때 팀 예산($10)이 반복 호출로 새지 않는다.
    for (let i = 0; i <= AI_MAX_RETRIES; i++) {
      const outcome = await this.attempt(`${baseUrl}/chat/completions`, apiKey, payload, timeoutMs, req.schema);
      if (outcome.ok) return outcome.value;
      if (!outcome.retryable) break;
    }
    // 원인과 무관하게 같은 오류로 모아 원문 응답·키가 밖으로 새지 않게 한다.
    throw new AiUnavailableError();
  }

  private async attempt<T>(
    url: string,
    apiKey: string,
    payload: string,
    timeoutMs: number,
    schema: z.ZodType<T>,
  ): Promise<Attempt<T>> {
    // 시도마다 새 타이머를 둬서 두 번째 시도가 이미 끊긴 신호를 물려받지 않게 한다.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let body: unknown;
    try {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: payload,
          signal: controller.signal,
        });
      } catch {
        return RETRYABLE; // 네트워크 오류·타임아웃
      }
      // 4xx(401 키 오류·402 예산·429 한도)는 다시 불러도 같으니 재시도하지 않는다.
      if (!res.ok) return res.status >= 500 ? RETRYABLE : FINAL;
      try {
        body = await res.json();
      } catch {
        return RETRYABLE; // 본문이 JSON이 아니거나 읽는 중 끊김
      }
    } finally {
      clearTimeout(timer);
    }

    const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
      ?.message?.content;
    if (typeof content !== 'string') return RETRYABLE;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return RETRYABLE;
    }
    const result = schema.safeParse(parsed);
    return result.success ? { ok: true, value: result.data } : RETRYABLE;
  }
}
