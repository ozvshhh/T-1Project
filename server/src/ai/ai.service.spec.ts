import { z } from 'zod';
import { AiUnavailableError } from './ai-unavailable.error';
import { AiService } from './ai.service';

// 실제 Gateway를 부르면 팀 예산($10)이 줄어든다. 전역 fetch를 가짜로 바꿔 요청 모양만 검사한다.
describe('AiService.json', () => {
  const realFetch = global.fetch;
  const savedEnv = { ...process.env };
  let fetchMock: jest.Mock;

  const schema = z.object({ a: z.number() });
  const request = { task: 't', system: 's', user: 'u', schema };

  function okResponse(content: string): Response {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  interface SentBody {
    model: string;
    messages: { role: string; content: string }[];
    response_format: { type: string; json_schema: { schema: unknown } };
  }

  function sentBody(init: RequestInit): SentBody {
    return JSON.parse(init.body as string) as SentBody;
  }

  beforeEach(() => {
    process.env = { ...savedEnv };
    delete process.env.AI_GATEWAY_BASE_URL;
    delete process.env.AI_MODEL;
    process.env.AI_GATEWAY_API_KEY = 'test-key';
    fetchMock = jest.fn().mockResolvedValue(okResponse('{"a":1}'));
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = realFetch;
    process.env = savedEnv;
  });

  it('기본 URL·Bearer 키·기본 모델·json_schema response_format·system/user 메시지로 POST한다', async () => {
    await new AiService().json(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');

    const body = sentBody(init);
    expect(body.model).toBe('openai/gpt-6.1-terra');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema).toMatchObject({
      type: 'object',
      properties: { a: { type: 'number' } },
    });
    expect(body.messages).toEqual([
      { role: 'system', content: 's' },
      { role: 'user', content: 'u' },
    ]);
  });

  it('정상 응답 content를 zod로 검증한 객체로 돌려준다', async () => {
    await expect(new AiService().json(request)).resolves.toEqual({ a: 1 });
  });

  it('AI_GATEWAY_BASE_URL·AI_MODEL 환경변수를 호출 시점에 읽어 URL·model을 바꾼다', async () => {
    process.env.AI_GATEWAY_BASE_URL = 'https://gateway.example.test/v9/';
    process.env.AI_MODEL = 'vendor/other-model';

    await new AiService().json(request);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example.test/v9/chat/completions');
    expect(sentBody(init).model).toBe('vendor/other-model');
  });

  // 키가 없으면 네트워크를 타지 않아야 비용·지연 없이 502로 바로 안내할 수 있다.
  it.each([
    ['빈 문자열', ''],
    ['미설정', undefined],
  ])('키가 %s이면 fetch를 부르지 않고 AiUnavailableError', async (_label, key) => {
    if (key === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = key;

    await expect(new AiService().json(request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 실패 원인이 무엇이든 하나의 오류로 모아야 전역 필터가 502 하나로 안내하고, 원문·키가 밖으로 새지 않는다.
  describe('실패 분류와 재시도 (C4-2)', () => {
    function statusResponse(status: number): Response {
      return new Response('raw-gateway-body', { status });
    }

    async function expectUnavailable(): Promise<void> {
      const err: unknown = await new AiService().json(request).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(AiUnavailableError);
      const message = (err as Error).message;
      expect(message).not.toContain('test-key');
      expect(message).not.toContain('raw-gateway-body');
    }

    // 4xx는 다시 불러도 결과가 같고 비용만 든다: 재시도하지 않는다.
    it.each([401, 429])('%d 응답 → AiUnavailableError, 호출 1회(재시도 없음)', async (status) => {
      fetchMock.mockReset().mockImplementation(() => Promise.resolve(statusResponse(status)));
      await expectUnavailable();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('500 응답이 계속되면 정확히 1회 재시도 후 AiUnavailableError(호출 2회)', async () => {
      fetchMock.mockReset().mockImplementation(() => Promise.resolve(statusResponse(500)));
      await expectUnavailable();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('500 뒤 정상 응답이면 재시도 결과를 돌려준다(호출 2회)', async () => {
      fetchMock
        .mockReset()
        .mockResolvedValueOnce(statusResponse(500))
        .mockResolvedValueOnce(okResponse('{"a":1}'));
      await expect(new AiService().json(request)).resolves.toEqual({ a: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['본문이 JSON이 아님', () => new Response('raw-gateway-body', { status: 200 })],
      ['content가 JSON이 아님', () => okResponse('raw-gateway-body')],
      ['스키마 불일치', () => okResponse('{"a":"raw-gateway-body"}')],
    ])('형식 오류(%s) → 1회 재시도 후 AiUnavailableError(호출 2회)', async (_label, make) => {
      fetchMock.mockReset().mockImplementation(() => Promise.resolve(make()));
      await expectUnavailable();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('첫 응답만 형식 오류이고 다음이 정상이면 성공(호출 2회)', async () => {
      fetchMock
        .mockReset()
        .mockResolvedValueOnce(okResponse('{"a":"x"}'))
        .mockResolvedValueOnce(okResponse('{"a":1}'));
      await expect(new AiService().json(request)).resolves.toEqual({ a: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('네트워크 오류 → 1회 재시도 후 AiUnavailableError(호출 2회)', async () => {
      fetchMock.mockReset().mockRejectedValue(new TypeError('fetch failed raw-gateway-body'));
      await expectUnavailable();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('타임아웃(AI_TIMEOUT_MS) → AiUnavailableError, 호출은 상한 2회 이하', async () => {
      process.env.AI_TIMEOUT_MS = '20';
      fetchMock.mockReset().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      await expectUnavailable();
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
      // 매 시도가 자기 타이머를 가져야 두 번째 시도가 이미 끊긴 신호로 바로 실패하지 않는다.
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const signals = calls.map(([, init]) => init.signal);
      expect(new Set(signals).size).toBe(signals.length);
    });
  });
});
