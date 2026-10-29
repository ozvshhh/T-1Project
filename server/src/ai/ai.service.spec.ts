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
});
