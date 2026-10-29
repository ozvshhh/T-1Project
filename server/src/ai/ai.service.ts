import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AiUnavailableError } from './ai-unavailable.error';
import { aiConfigFromEnv } from './ai.config';

export interface AiJsonRequest<T> {
  // 로그·테스트 가짜에서 호출을 구분하는 이름(예: 'coverletter-feedback').
  task: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let body: unknown;
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: req.task, strict: true, schema: jsonSchema },
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new AiUnavailableError();
      body = await res.json();
    } catch {
      // 네트워크·타임아웃·상태 코드 오류를 구분 없이 감싼다(원문·키가 밖으로 새지 않게).
      throw new AiUnavailableError();
    } finally {
      clearTimeout(timer);
    }

    const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
      ?.message?.content;
    if (typeof content !== 'string') throw new AiUnavailableError();

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AiUnavailableError();
    }
    const result = req.schema.safeParse(parsed);
    if (!result.success) throw new AiUnavailableError();
    return result.data;
  }
}
