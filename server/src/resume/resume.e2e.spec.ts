import { Server } from 'node:http';
import * as os from 'node:os';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { AiModule } from '../ai/ai.module';
import { AiService } from '../ai/ai.service';
import { FakeAiService } from '../ai/fake-ai.service';
import { AuthModule } from '../auth/auth.module';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { ExperiencesModule } from '../experiences/experiences.module';
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

// 붙여넣은 이력서를 AI가 활동으로 나눠 초안을 만드는 것이 경험의 출발점이다(R2). 중복이 섞이거나
// 실패 때 글·초안이 바뀌면 사용자는 같은 경험을 두 번 만들거나 입력을 잃는다(C2).
describe('C10-2 POST /api/resume (AI 활동 나누기)', () => {
  const savedSecret = process.env.JWT_SECRET;
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let connection: Connection;
  const fake = new FakeAiService();
  const http = () => request(app.getHttpServer() as Server);

  async function signup(email: string): Promise<{ token: string; id: string }> {
    const res = await http().post('/api/auth/signup').send({ email, password: 'pass-1234' }).expect(201);
    const body = res.body as { token: string; user: { id: string } };
    return { token: body.token, id: body.user.id };
  }

  const getResume = async (token: string): Promise<ResumeBody> => {
    const res = await http().get('/api/resume').set('Authorization', `Bearer ${token}`).expect(200);
    return (res.body as { resume: ResumeBody }).resume;
  };

  const paste = (token: string, body: unknown) =>
    http().post('/api/resume').set('Authorization', `Bearer ${token}`).send(body as object);

  // 경험을 따로 만드는 API가 없으므로(명세 10) 테스트는 모델에 직접 저장한다.
  const insertExperience = (userId: string, title: string) =>
    connection.collection('experiences').insertOne({
      userId: new Types.ObjectId(userId),
      title,
      period: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  const activity = (title: string, period = '', summary = '') => ({ title, period, summary });

  let a: { token: string; id: string };
  let b: { token: string; id: string };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    mongod = await MongoMemoryServer.create();
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
    await connection.collection('users').deleteMany({});
    await connection.collection('resumes').deleteMany({});
    await connection.collection('experiences').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  // AI가 나눈 활동이 ai 초안으로 저장돼야 프런트가 직접 추가한 것과 구분해 보여 준다(api.md 4절).
  it('adds AI activities as ai drafts and returns 200 {resume, added}', async () => {
    const text = '- 캡스톤 프로젝트 백엔드 (2025년)\n- 학생회 홍보부 (2023년)';
    fake.queue('resume-split', {
      activities: [
        activity('캡스톤 프로젝트 백엔드', '2025년', '캡스톤 줄'),
        activity('학생회 홍보부', '2023년', '학생회 줄'),
      ],
    });

    const res = await paste(a.token, { text });
    expect(res.status).toBe(200);
    const body = res.body as { resume: ResumeBody; added: DraftBody[] };
    expect(Object.keys(body).sort()).toEqual(['added', 'resume']);
    expect(body.added.map((d) => ({ title: d.title, period: d.period, summary: d.summary, origin: d.origin }))).toEqual([
      { title: '캡스톤 프로젝트 백엔드', period: '2025년', summary: '캡스톤 줄', origin: 'ai' },
      { title: '학생회 홍보부', period: '2023년', summary: '학생회 줄', origin: 'ai' },
    ]);
    for (const d of body.added) expect(typeof d.id).toBe('string');
    expect(body.resume.text).toBe(text);
    expect(body.resume.drafts).toEqual(body.added);
    expect(typeof body.resume.updatedAt).toBe('string');
    expect(await getResume(a.token)).toEqual(body.resume);

    // AI에 붙여넣은 글이 실제로 들어가야 글에 있는 활동만 나눈다.
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].task).toBe('resume-split');
    expect(fake.calls[0].user).toContain(text);
  });

  // 같은 제목이 두 번 들어가면 확정 뒤 같은 경험이 둘 생긴다. 남의 제목으로 내 활동이 빠지면 안 된다(R1).
  it('drops titles equal to my experiences, my drafts, earlier ones in the response, and blank titles', async () => {
    await insertExperience(a.id, '기존 경험');
    await http()
      .post('/api/resume/drafts')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ title: '기존 초안' })
      .expect(201);
    await insertExperience(b.id, 'B의 경험');
    await http()
      .post('/api/resume/drafts')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ title: 'B의 초안' })
      .expect(201);

    fake.queue('resume-split', {
      activities: [
        activity('  기존 경험  '),
        activity('기존 초안'),
        activity('새 활동', '2024년', '첫 번째'),
        activity(' 새 활동 ', '2025년', '두 번째'),
        activity(''),
        activity('   '),
        activity('B의 경험'),
        activity('B의 초안'),
      ],
    });

    const res = await paste(a.token, { text: '이력서 글' });
    expect(res.status).toBe(200);
    const body = res.body as { resume: ResumeBody; added: DraftBody[] };
    expect(body.added.map((d) => [d.title, d.period, d.summary])).toEqual([
      ['새 활동', '2024년', '첫 번째'],
      ['B의 경험', '', ''],
      ['B의 초안', '', ''],
    ]);
    expect(body.resume.drafts.map((d) => d.title)).toEqual(['기존 초안', '새 활동', 'B의 경험', 'B의 초안']);
    // B의 이력서는 A의 붙여넣기로 바뀌지 않는다.
    expect((await getResume(b.token)).drafts.map((d) => d.title)).toEqual(['B의 초안']);
  });

  // 이력서를 고쳐 다시 붙여넣으면 이미 있는 초안은 그대로 두고 새 활동만 더해야 한다(api.md 4절).
  it('re-pasting replaces text and adds only new activities', async () => {
    fake.queue('resume-split', { activities: [activity('A활동')] }, { activities: [activity('A활동'), activity('B활동')] });
    const firstRes = await paste(a.token, { text: '첫 글' });
    expect(firstRes.status).toBe(200);
    const first = firstRes.body as { resume: ResumeBody; added: DraftBody[] };

    const res = await paste(a.token, { text: '고친 글' });
    expect(res.status).toBe(200);
    const body = res.body as { resume: ResumeBody; added: DraftBody[] };
    expect(body.resume.text).toBe('고친 글');
    expect(body.added.map((d) => d.title)).toEqual(['B활동']);
    expect(body.resume.drafts.map((d) => d.title)).toEqual(['A활동', 'B활동']);
    expect(body.resume.drafts[0]).toEqual(first.added[0]);
    expect(fake.calls[1].user).toContain('고친 글');
  });

  // 빈 글로 AI를 부르면 팀 예산($10)만 쓰고 얻는 게 없다.
  it('rejects missing, empty, blank and non-string text with 400 without calling AI', async () => {
    for (const body of [{}, { text: '' }, { text: '   ' }, { text: 3 }]) {
      const res = await paste(a.token, body);
      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION');
      expect((res.body as ErrorBody).error.details?.map((d) => d.field)).toContain('text');
    }
    expect(fake.calls).toHaveLength(0);
    expect(await getResume(a.token)).toEqual({ text: null, drafts: [], updatedAt: null });
  });

  // AI가 실패하면 글도 저장하지 않아야 사용자가 같은 글로 다시 시도하고 이전 상태를 잃지 않는다(C2).
  it('AI failure and out-of-schema responses are 502 and leave text and drafts unchanged', async () => {
    fake.queue('resume-split', { activities: [activity('A활동', '2024년', 'a')] });
    expect((await paste(a.token, { text: '이전 글' })).status).toBe(200);
    const before = await getResume(a.token);

    fake.fail('resume-split');
    const failed = await paste(a.token, { text: '새 글' });
    expect(failed.status).toBe(502);
    expect((failed.body as ErrorBody).error.code).toBe('AI_UNAVAILABLE');
    expect(await getResume(a.token)).toEqual(before);

    fake.queue('resume-split', { activities: [{ title: 1 }] });
    const bad = await paste(a.token, { text: '새 글' });
    expect(bad.status).toBe(502);
    expect(await getResume(a.token)).toEqual(before);

    // 이력서가 없던 계정도 실패 뒤에 문서가 생기지 않는다.
    fake.fail('resume-split');
    expect((await paste(b.token, { text: 'B 글' })).status).toBe(502);
    expect(await connection.collection('resumes').countDocuments({ userId: new Types.ObjectId(b.id) })).toBe(0);
  });

  // 로그인 전에는 AI를 부를 수 없다(C3).
  it('requests without a token are 401', async () => {
    expect((await http().post('/api/resume').send({ text: '글' })).status).toBe(401);
    expect(fake.calls).toHaveLength(0);
  });
});

interface ExperienceBody {
  id: string;
  title: string;
  period: string;
  summary: string;
  clues: unknown[];
  itemStatus: Record<string, unknown>;
  card: Record<string, unknown[]>;
  candidates: unknown[];
  createdAt: string;
  updatedAt: string;
}

const ITEMS = ['situation', 'role', 'action', 'result', 'meaning'];

// 경험은 이력서 초안을 확정해서만 생긴다(명세 10). 순서가 바뀌거나 일부만 만들어지면 사용자가 고른 활동과
// 경험 목록이 어긋나고, 남의 초안이 섞여도 만들어지면 계정 분리(R1)가 깨진다.
describe('C10-3 POST /api/resume/drafts/confirm', () => {
  const savedSecret = process.env.JWT_SECRET;
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let connection: Connection;
  // 확정은 AI를 부르지 않는다. 호출 기록으로 0회를 확인한다.
  const fake = new FakeAiService();
  const http = () => request(app.getHttpServer() as Server);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(email: string): Promise<string> {
    const res = await http().post('/api/auth/signup').send({ email, password: 'pass-1234' }).expect(201);
    return (res.body as { token: string }).token;
  }

  async function draft(token: string, body: object): Promise<DraftBody> {
    const res = await http().post('/api/resume/drafts').set(auth(token)).send(body).expect(201);
    return (res.body as { draft: DraftBody }).draft;
  }

  const confirm = (token: string, body: unknown) =>
    http().post('/api/resume/drafts/confirm').set(auth(token)).send(body as object);

  const getResume = async (token: string): Promise<ResumeBody> => {
    const res = await http().get('/api/resume').set(auth(token)).expect(200);
    return (res.body as { resume: ResumeBody }).resume;
  };

  const listExperiences = async (token: string): Promise<ExperienceBody[]> => {
    const res = await http().get('/api/experiences').set(auth(token)).expect(200);
    return (res.body as { experiences: ExperienceBody[] }).experiences;
  };

  let a: string;
  let b: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    mongod = await MongoMemoryServer.create();
    // 확정 경험이 경험 API에 보이는지까지 보려고 ExperiencesModule도 함께 띄운다.
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
        AiModule,
        ResumeModule,
        ExperiencesModule,
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
    expect(fake.calls).toHaveLength(0);
    await connection.collection('users').deleteMany({});
    await connection.collection('resumes').deleteMany({});
    await connection.collection('experiences').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  // 확정 경험은 초안 값을 그대로 이어받고 단서·사실·대화 없이 시작해야 R3 대화가 이력서 내용에서 출발한다.
  it('creates experiences in request order from draft values and removes those drafts', async () => {
    const A = await draft(a, { title: 'A활동', period: '2024년', summary: 'A 줄' });
    const B = await draft(a, { title: 'B활동', period: '2023년', summary: 'B 줄' });
    const C = await draft(a, { title: 'C활동', summary: 'C 줄' });

    const res = await confirm(a, { draftIds: [C.id, A.id] });
    expect(res.status).toBe(201);
    const body = res.body as { experiences: ExperienceBody[] };
    expect(Object.keys(body)).toEqual(['experiences']);
    expect(body.experiences.map((e) => [e.title, e.period, e.summary])).toEqual([
      ['C활동', '', 'C 줄'],
      ['A활동', '2024년', 'A 줄'],
    ]);
    for (const exp of body.experiences) {
      expect(Object.keys(exp).sort()).toEqual(
        ['candidates', 'card', 'clues', 'createdAt', 'id', 'itemStatus', 'period', 'summary', 'title', 'updatedAt'].sort(),
      );
      expect(exp.id).toMatch(/^[0-9a-f]{24}$/);
      expect(exp.clues).toEqual([]);
      expect(exp.card).toEqual(Object.fromEntries(ITEMS.map((i) => [i, []])));
      expect(exp.candidates).toEqual([]);
      expect(exp.itemStatus).toEqual(Object.fromEntries(ITEMS.map((i) => [i, null])));
    }

    expect((await getResume(a)).drafts).toEqual([B]);

    // 만든 경험은 목록·상세에 summary와 함께 보인다.
    const list = await listExperiences(a);
    expect(list.map((e) => e.id).sort()).toEqual(body.experiences.map((e) => e.id).sort());
    for (const exp of body.experiences) {
      expect(list.find((e) => e.id === exp.id)).toEqual(exp);
      const detail = await http().get(`/api/experiences/${exp.id}`).set(auth(a)).expect(200);
      expect((detail.body as { experience: ExperienceBody }).experience).toEqual(exp);
    }

    // PATCH 응답에도 summary가 남아야 프런트가 고친 뒤 이력서 내용을 잃지 않는다.
    const patched = await http()
      .patch(`/api/experiences/${body.experiences[1].id}`)
      .set(auth(a))
      .send({ title: 'A활동(수정)' })
      .expect(200);
    expect((patched.body as { experience: ExperienceBody }).experience).toMatchObject({
      title: 'A활동(수정)',
      summary: 'A 줄',
    });

    // B의 목록에는 A가 확정한 경험이 보이지 않는다(R1).
    expect(await listExperiences(b)).toEqual([]);
  });

  // 고를 초안이 없거나 형식이 틀리면 아무것도 만들지 않고 400으로 돌려보낸다(api.md 4절 "1개 이상").
  it.each([
    ['missing body', {}],
    ['empty array', { draftIds: [] }],
    ['string', { draftIds: 'x' }],
    ['number items', { draftIds: [1] }],
    ['mixed items', { draftIds: ['0123456789abcdef01234567', null] }],
  ])('rejects %s with 400 VALIDATION', async (_label, body) => {
    const A = await draft(a, { title: 'A활동' });
    const res = await confirm(a, body);
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION');
    expect((res.body as ErrorBody).error.details?.map((d) => d.field)).toContain('draftIds');
    expect((await getResume(a)).drafts).toEqual([A]);
    expect(await listExperiences(a)).toEqual([]);
  });

  // 하나라도 내 초안이 아니면 전부 막아야 일부만 만들어져 다시 고를 수 없는 상태가 되지 않고, 남의 초안도 쓰이지 않는다(R1).
  it('404s and changes nothing when a missing, malformed or other account draft is mixed in', async () => {
    const A = await draft(a, { title: 'A활동' });
    const other = await draft(b, { title: 'B활동' });

    for (const ids of [
      [A.id, '0123456789abcdef01234567'],
      [A.id, 'bad-id'],
      [A.id, other.id],
    ]) {
      const res = await confirm(a, { draftIds: ids });
      expect(res.status).toBe(404);
      expect((res.body as ErrorBody).error.code).toBe('NOT_FOUND');
      expect((await getResume(a)).drafts).toEqual([A]);
      expect(await listExperiences(a)).toEqual([]);
    }
    expect((await getResume(b)).drafts).toEqual([other]);
    expect(await listExperiences(b)).toEqual([]);

    // 이력서 문서가 아직 없는 계정도 같은 404다.
    const c = await signup('c@example.com');
    expect((await confirm(c, { draftIds: [A.id] })).status).toBe(404);
    expect((await getResume(a)).drafts).toEqual([A]);
  });

  // 확정한 초안은 목록에서 빠지므로 다시 확정하면 404: 같은 경험이 두 번 생기지 않는다.
  it('a confirmed draft cannot be confirmed again', async () => {
    const A = await draft(a, { title: 'A활동' });
    expect((await confirm(a, { draftIds: [A.id] })).status).toBe(201);
    expect((await confirm(a, { draftIds: [A.id] })).status).toBe(404);
    expect(await listExperiences(a)).toHaveLength(1);
  });

  // 경험은 초안 확정으로만 만든다(학생 결정 2026-10-30): 따로 만드는 경로가 남으면 이력서를 거치지 않은 경험이 생긴다.
  it('POST /api/experiences no longer exists (404)', async () => {
    const res = await http().post('/api/experiences').set(auth(a)).send({ title: '축제', period: '2025년' });
    expect(res.status).toBe(404);
    expect(await listExperiences(a)).toEqual([]);
  });

  // 로그인 전에는 경험을 만들 수 없다(C3).
  it('requires a token', async () => {
    expect((await http().post('/api/resume/drafts/confirm').send({ draftIds: ['x'] })).status).toBe(401);
  });
});
