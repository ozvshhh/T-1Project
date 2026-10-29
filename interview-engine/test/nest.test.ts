import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InterviewModule, llmFromEnv } from '../nest/index.js';
import { GatewayLlmClient } from '../src/llm.js';
import { MemorySessionStore } from '../src/store.js';
import { COVER_LETTER, FakeLlm, FOUR_QUESTIONS, nextMain, RESUME } from './helpers.js';

describe('NestJS 면접 모듈', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const llm = new FakeLlm({ main_questions: () => FOUR_QUESTIONS, interview_turn: () => nextMain() });
    const moduleRef = await Test.createTestingModule({
      imports: [InterviewModule.forRoot({ store: new MemorySessionStore(), llm })],
    }).compile();
    app = moduleRef.createNestApplication();
    // 팀의 인증 가드 대신: 헤더로 로그인 사용자를 넣는다
    app.use((req: { user?: { id: string }; headers: Record<string, string | undefined> }, _res: unknown, next: () => void) => {
      const id = req.headers['x-test-user'];
      if (id) req.user = { id };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const as = (user: string) => ({
    post: (url: string) => request(app.getHttpServer()).post(url).set('x-test-user', user),
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-test-user', user),
  });

  it('로그인하지 않으면 401', async () => {
    const res = await request(app.getHttpServer()).post('/api/interviews').send({ resume: RESUME });
    expect(res.status).toBe(401);
  });

  it('시작 → 답변 → 종료 → 결과까지 API로 진행된다', async () => {
    const start = await as('u1').post('/api/interviews').send({ resume: RESUME, coverLetter: COVER_LETTER });
    expect(start.status).toBe(201);
    expect(start.body.current.interviewerLabel).toMatch(/면접관/);
    const id = start.body.sessionId;

    const ans = await as('u1')
      .post(`/api/interviews/${id}/answers`)
      .send({ questionId: start.body.current.questionId, text: '로그인 API를 맡았어요', source: 'voice' });
    expect(ans.status).toBe(200);
    expect(ans.body.questionCount).toBe(2);

    const end = await as('u1').post(`/api/interviews/${id}/end`);
    expect(end.status).toBe(200);
    expect(end.body.endReason).toBe('user_ended');

    const result = await as('u1').get(`/api/interviews/${id}/result`);
    expect(result.status).toBe(200);
    expect(result.body.log[0].answer.source).toBe('voice');
  });

  it('잘못된 요청은 400, 남의 면접은 404, 두 번 제출은 409', async () => {
    const start = await as('u2').post('/api/interviews').send({ resume: RESUME, coverLetter: COVER_LETTER });
    const id = start.body.sessionId;
    const qid = start.body.current.questionId;

    expect((await as('u2').post(`/api/interviews/${id}/answers`).send({ text: '질문 id 없음' })).status).toBe(400);
    expect((await as('u2').post(`/api/interviews/${id}/answers`).send({ questionId: qid, text: '   ' })).status).toBe(400);
    expect((await as('someone').get(`/api/interviews/${id}`)).status).toBe(404);

    expect((await as('u2').post(`/api/interviews/${id}/answers`).send({ questionId: qid, text: '답' })).status).toBe(200);
    const dup = await as('u2').post(`/api/interviews/${id}/answers`).send({ questionId: qid, text: '답' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('conflict');
  });

  it('끝나기 전 결과 요청은 409', async () => {
    const start = await as('u3').post('/api/interviews').send({ resume: RESUME });
    expect((await as('u3').get(`/api/interviews/${start.body.sessionId}/result`)).status).toBe(409);
  });
});

describe('llmFromEnv', () => {
  it('키가 없으면 null(앱은 뜨고 기본 질문으로 진행)', () => {
    expect(llmFromEnv({})).toBeNull();
  });
  it('키가 있으면 기본 모델 openai/gpt-6.1-terra, 추론 강도 low', () => {
    const llm = llmFromEnv({ AI_GATEWAY_API_KEY: 'k' }) as GatewayLlmClient;
    expect(llm).toBeInstanceOf(GatewayLlmClient);
    expect((llm as unknown as { model: string }).model).toBe('openai/gpt-6.1-terra');
    expect((llm as unknown as { reasoningEffort: string }).reasoningEffort).toBe('low');
  });
});
