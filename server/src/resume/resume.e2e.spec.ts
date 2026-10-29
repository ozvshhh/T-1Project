import { Server } from 'node:http';
import * as os from 'node:os';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AiModule } from '../ai/ai.module';
import { AiService } from '../ai/ai.service';
import { FakeAiService } from '../ai/fake-ai.service';
import { AuthModule } from '../auth/auth.module';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { UsersModule } from '../users/users.module';
import { ResumeModule } from './resume.module';

interface DraftBody {
  id: string;
  title: string;
  period: string;
  summary: string;
  origin: string;
}

interface ResumeBody {
  text: string | null;
  drafts: DraftBody[];
  updatedAt: string | null;
}

interface ErrorBody {
  error: { code: string; message: string; details?: { field: string; reason: string }[] };
}

// 이력서 초안은 경험을 만드는 유일한 출발점이라(api.md 4절), 모양이 틀리거나 남의 초안이 보이고 고쳐지면 R1·R2가 함께 깨진다.
describe('C10-1 /api/resume get·drafts create·patch·delete', () => {
  const savedSecret = process.env.JWT_SECRET;
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let connection: Connection;
  // 초안 직접 추가·수정·삭제는 AI 없이 끝나야 한다(명세 10 결정). 호출 기록으로 0회를 확인한다.
  const fake = new FakeAiService();
  const http = () => request(app.getHttpServer() as Server);

  async function signup(email: string): Promise<string> {
    const res = await http().post('/api/auth/signup').send({ email, password: 'pass-1234' }).expect(201);
    return (res.body as { token: string }).token;
  }

  const getResume = async (token: string): Promise<ResumeBody> => {
    const res = await http().get('/api/resume').set('Authorization', `Bearer ${token}`).expect(200);
    return (res.body as { resume: ResumeBody }).resume;
  };

  const createDraft = (token: string, body: unknown) =>
    http().post('/api/resume/drafts').set('Authorization', `Bearer ${token}`).send(body as object);

  const patchDraft = (token: string, id: string, body: unknown) =>
    http().patch(`/api/resume/drafts/${id}`).set('Authorization', `Bearer ${token}`).send(body as object);

  const deleteDraft = (token: string, id: string) =>
    http().delete(`/api/resume/drafts/${id}`).set('Authorization', `Bearer ${token}`);

  async function createDraftOk(token: string, body: unknown): Promise<DraftBody> {
    const res = await createDraft(token, body);
    expect(res.status).toBe(201);
    return (res.body as { draft: DraftBody }).draft;
  }

  const expectValidation = (res: request.Response, field: string) => {
    expect(res.status).toBe(400);
    const body = res.body as ErrorBody;
    expect(body.error.code).toBe('VALIDATION');
    expect(body.error.details?.map((d) => d.field)).toContain(field);
  };

  const expectNotFound = (res: request.Response) => {
    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error.code).toBe('NOT_FOUND');
  };

  let a: string;
  let b: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    mongod = await MongoMemoryServer.create();
    // 운영 createApp과 같은 prefix·오류 필터로 띄워 실제 경로·본문을 검증한다.
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
        AiModule,
        ResumeModule,
      ],
    })
      .overrideProvider(AiService)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api', { exclude: ['__health'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    await connection.model('User').syncIndexes();
    await connection.model('Resume').syncIndexes();
  }, 120_000);

  beforeEach(async () => {
    fake.reset();
    a = await signup('a@example.com');
    b = await signup('b@example.com');
  });

  afterEach(async () => {
    // 이 주장의 API는 어떤 경우에도 AI를 부르지 않는다.
    expect(fake.calls).toHaveLength(0);
    await connection.collection('users').deleteMany({});
    await connection.collection('resumes').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  // 프런트는 처음 화면에서 null·빈 배열로 "아직 붙여넣지 않음"을 판단한다(api.md 4절).
  it('GET returns an empty resume before anything is saved', async () => {
    const res = await http().get('/api/resume').set('Authorization', `Bearer ${a}`).expect(200);
    expect(res.body).toEqual({ resume: { text: null, drafts: [], updatedAt: null } });
  });

  // 직접 추가한 초안은 manual로 구분되고 빠진 칸은 빈 문자열이어야 화면이 null 처리 없이 그린다.
  it('POST /drafts creates a manual draft with empty defaults and GET shows it', async () => {
    const res = await createDraft(a, { title: '  A  ' });
    expect(res.status).toBe(201);
    const body = res.body as { draft: DraftBody };
    expect(Object.keys(body)).toEqual(['draft']);
    expect(Object.keys(body.draft).sort()).toEqual(['id', 'origin', 'period', 'summary', 'title']);
    expect(typeof body.draft.id).toBe('string');
    expect(body.draft).toEqual({ id: body.draft.id, title: 'A', period: '', summary: '', origin: 'manual' });

    const full = await createDraftOk(a, { title: 'B', period: '2025년', summary: '한 줄' });
    expect(full).toMatchObject({ title: 'B', period: '2025년', summary: '한 줄', origin: 'manual' });

    const resume = await getResume(a);
    expect(resume.text).toBeNull();
    expect(resume.drafts.map((d) => d.id)).toEqual([body.draft.id, full.id]);
    expect(resume.drafts[0]).toEqual(body.draft);
  });

  // 이름 없는 초안은 경험이 돼도 구분할 수 없으므로 막는다.
  it('POST /drafts rejects missing, empty and blank title with 400', async () => {
    expectValidation(await createDraft(a, {}), 'title');
    expectValidation(await createDraft(a, { title: '' }), 'title');
    expectValidation(await createDraft(a, { title: '   ' }), 'title');
    expectValidation(await createDraft(a, { title: 3 }), 'title');
    expect((await getResume(a)).drafts).toEqual([]);
  });

  // 사용자가 AI가 나눈 제목·시기·내용을 바로잡을 수 있어야 경험이 이력서와 맞는다(R2).
  it('PATCH updates title, period and summary; blank title is 400', async () => {
    const draft = await createDraftOk(a, { title: 'A' });

    const res = await patchDraft(a, draft.id, { title: 'A2', period: '2024년', summary: '고친 줄' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      draft: { id: draft.id, title: 'A2', period: '2024년', summary: '고친 줄', origin: 'manual' },
    });

    expectValidation(await patchDraft(a, draft.id, { title: '  ' }), 'title');
    expectValidation(await patchDraft(a, draft.id, { title: '' }), 'title');

    const partial = await patchDraft(a, draft.id, { period: '' });
    expect(partial.status).toBe(200);
    expect((partial.body as { draft: DraftBody }).draft).toMatchObject({ title: 'A2', period: '', summary: '고친 줄' });

    expect((await getResume(a)).drafts).toEqual([
      { id: draft.id, title: 'A2', period: '', summary: '고친 줄', origin: 'manual' },
    ]);
  });

  // 지운 초안이 다시 보이면 확정 때 원치 않는 경험이 생긴다.
  it('DELETE returns 204 and removes the draft', async () => {
    const keep = await createDraftOk(a, { title: 'keep' });
    const gone = await createDraftOk(a, { title: 'gone' });

    const res = await deleteDraft(a, gone.id);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await getResume(a)).drafts.map((d) => d.id)).toEqual([keep.id]);
    expectNotFound(await deleteDraft(a, gone.id));
  });

  // 남의 초안·없는 초안·잘못된 id를 같은 404로 돌려줘야 다른 계정 자원이 있는지조차 알 수 없다(R1).
  it('other account, unknown id and malformed id are 404; other account sees an empty resume', async () => {
    const draft = await createDraftOk(a, { title: 'A의 활동' });

    expectNotFound(await patchDraft(b, draft.id, { title: '탈취' }));
    expectNotFound(await deleteDraft(b, draft.id));
    expect(await getResume(b)).toEqual({ text: null, drafts: [], updatedAt: null });

    // B에게 이력서 문서가 생겨도 A의 초안은 B의 경로로 닿지 않는다.
    await createDraftOk(b, { title: 'B의 활동' });
    expectNotFound(await patchDraft(b, draft.id, { title: '탈취' }));
    expectNotFound(await deleteDraft(b, draft.id));
    expect((await getResume(b)).drafts.map((d) => d.title)).toEqual(['B의 활동']);

    const missing = '0123456789abcdef01234567';
    expectNotFound(await patchDraft(a, missing, { title: 'x' }));
    expectNotFound(await deleteDraft(a, missing));
    expectNotFound(await patchDraft(a, 'not-an-id', { title: 'x' }));
    expectNotFound(await deleteDraft(a, 'not-an-id'));

    expect((await getResume(a)).drafts).toEqual([draft]);
  });

  // 로그인 전에는 어떤 이력서 기능도 쓸 수 없다(C3).
  it('requests without a token are 401', async () => {
    const id = '0123456789abcdef01234567';
    expect((await http().get('/api/resume')).status).toBe(401);
    expect((await http().post('/api/resume/drafts').send({ title: 'x' })).status).toBe(401);
    expect((await http().patch(`/api/resume/drafts/${id}`).send({ title: 'x' })).status).toBe(401);
    expect((await http().delete(`/api/resume/drafts/${id}`)).status).toBe(401);
  });
});
