import { describe, expect, it } from 'vitest';
import { GatewayLlmClient, LlmError } from '../src/llm.js';
import { TurnSchema } from '../src/schemas.js';
import { nextMain } from './helpers.js';

const req = { system: 's', user: 'u', schemaName: 'interview_turn', schema: TurnSchema };

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (content: string) => ({ choices: [{ message: { content } }] });

describe('GatewayLlmClient', () => {
  it('OpenAI 호환 형식으로 요청하고 JSON 응답을 스키마로 검사한다', async () => {
    const { impl, calls } = fakeFetch(200, ok(JSON.stringify(nextMain())));
    const client = new GatewayLlmClient({ model: 'provider/model-id', apiKey: 'test-key', fetchImpl: impl });
    const out = await client.json(req);
    expect(out.decision).toBe('next_main');

    expect(calls[0]!.url).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.model).toBe('provider/model-id');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('interview_turn');
    expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
    expect(body.response_format.json_schema.schema.properties.decision).toBeTruthy();
  });

  it('코드 블록으로 감싼 JSON도 읽는다', async () => {
    const { impl } = fakeFetch(200, ok('```json\n' + JSON.stringify(nextMain()) + '\n```'));
    const client = new GatewayLlmClient({ model: 'm', apiKey: 'k', fetchImpl: impl });
    await expect(client.json(req)).resolves.toMatchObject({ decision: 'next_main' });
  });

  it('키가 없으면 호출하지 않고 no_key', async () => {
    const { impl, calls } = fakeFetch(200, ok('{}'));
    const prev = process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    try {
      const client = new GatewayLlmClient({ model: 'm', fetchImpl: impl });
      await expect(client.json(req)).rejects.toMatchObject({ code: 'no_key' });
      expect(calls).toHaveLength(0);
    } finally {
      if (prev !== undefined) process.env.AI_GATEWAY_API_KEY = prev;
    }
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [402, 'budget'],
    [429, 'rate_limit'],
    [500, 'upstream'],
  ])('HTTP %i → %s', async (status, code) => {
    const { impl } = fakeFetch(status, { error: { message: 'x' } });
    const client = new GatewayLlmClient({ model: 'm', apiKey: 'k', fetchImpl: impl });
    await expect(client.json(req)).rejects.toMatchObject({ code });
  });

  it('형식이 틀린 응답은 bad_response', async () => {
    const { impl } = fakeFetch(200, ok(JSON.stringify({ decision: 'dance' })));
    const client = new GatewayLlmClient({ model: 'm', apiKey: 'k', fetchImpl: impl });
    await expect(client.json(req)).rejects.toBeInstanceOf(LlmError);
    await expect(client.json(req)).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('응답이 늦으면 timeout', async () => {
    const impl = ((_: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const client = new GatewayLlmClient({ model: 'm', apiKey: 'k', fetchImpl: impl, timeoutMs: 20 });
    await expect(client.json(req)).rejects.toMatchObject({ code: 'timeout' });
  });
});
