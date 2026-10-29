import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../main';

const SHA_A = 'a'.repeat(39) + '1';
const SHA_B = 'b'.repeat(39) + '2';
const SECRETS = {
  SEED_USER_PASSWORD: 'secret-seed-password-marker',
  AI_GATEWAY_API_KEY: 'secret-ai-key-marker',
  SESSION_SECRET: 'secret-session-marker',
  DATABASE_URL: 'mongodb://secret-db-marker:27017/app',
};

describe('C1-2 GET /__health', () => {
  const saved = { ...process.env };
  let app: INestApplication;

  // 기동 시 읽는 구현이든 요청마다 읽는 구현이든 맞도록, RELEASE_ID를 바꿀 때마다 앱을 새로 만든다.
  const boot = async (releaseId: string) => {
    process.env.RELEASE_ID = releaseId;
    Object.assign(process.env, SECRETS);
    app = await createApp();
    await app.init();
  };

  afterEach(async () => {
    await app?.close();
    process.env = { ...saved };
  });

  // 주최 측이 배포 버전을 이 응답으로 확인한다: 인증 없이 200, 정확히 releaseId 하나, 캐시 금지, JSON.
  it('returns 200 with exactly { releaseId } from RELEASE_ID, no-store, JSON', async () => {
    await boot(SHA_A);
    const res = await request(app.getHttpServer() as Server).get('/__health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ releaseId: SHA_A });
    expect(Object.keys(res.body as object)).toEqual(['releaseId']);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['content-type']).toMatch(/^application\/json/);
  });

  // 고정값 구현을 막는다: RELEASE_ID가 바뀌면 응답도 바뀌어야 커밋 SHA 검증이 의미가 있다.
  it('reflects a different RELEASE_ID value', async () => {
    await boot(SHA_B);
    const res = await request(app.getHttpServer() as Server).get('/__health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ releaseId: SHA_B });
  });

  // 공개 경로라서 비밀값이나 다른 환경변수가 섞이면 그대로 외부에 샌다.
  it('does not leak secrets or other env values', async () => {
    await boot(SHA_A);
    const res = await request(app.getHttpServer() as Server).get('/__health');
    for (const value of Object.values(SECRETS)) {
      expect(res.text).not.toContain(value);
      expect(JSON.stringify(res.body)).not.toContain(value);
    }
  });

  // 전역 prefix(api)에서 제외돼야 주최 측이 부르는 /__health 경로에 그대로 붙는다.
  it('is served at /__health, not under /api', async () => {
    await boot(SHA_A);
    const res = await request(app.getHttpServer() as Server).get('/api/__health');
    expect(res.status).toBe(404);
  });
});
