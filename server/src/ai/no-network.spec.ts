import { z } from 'zod';
import { AiUnavailableError } from './ai-unavailable.error';
import { AiService } from './ai.service';
import { NO_NETWORK_MESSAGE } from '../no-network.setup';

// 테스트가 실제 Gateway를 부르면 팀 예산($10)이 줄어든다. jest setup이 전역 fetch를 막는지 검사한다.
describe('테스트 네트워크 차단 (jest setupFiles)', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('mock 없이 fetch를 부르면 즉시 실패한다', async () => {
    await expect(fetch('https://example.com')).rejects.toThrow(NO_NETWORK_MESSAGE);
  });

  it('키가 있어도 실제 AiService.json은 Gateway에 닿지 못하고 AiUnavailableError가 된다', async () => {
    process.env.AI_GATEWAY_API_KEY = 'k';
    const request = { task: 't', system: 's', user: 'u', schema: z.object({ a: z.number() }) };
    await expect(new AiService().json(request)).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
