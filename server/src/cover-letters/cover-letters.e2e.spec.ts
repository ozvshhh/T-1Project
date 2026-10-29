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
import { UsersModule } from '../users/users.module';
import { CoverLettersModule } from './cover-letters.module';

interface CoverLetterBody {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  target: unknown;
  items: unknown[];
  createdAt: string;
  updatedAt: string;
}

interface ErrorBody {
  error: { code: string; message: string; details?: { field: string; reason: string }[] };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 붙여넣은 자소서는 점검(R9~R12)의 출발점이라, 모양이 api.md 2절과 다르거나 남의 자소서가 보이면 이후 단계가 전부 틀어진다(R1·R7).
describe('C7-1 /api/cover-letters create·list·patch', () => {
  const savedSecret = process.env.JWT_SECRET;
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let connection: Connection;
  // AI를 부르면 안 되는 API(C7-2)가 실제로 부르지 않았는지 호출 기록으로 확인한다.
  const fake = new FakeAiService();
  const http = () => request(app.getHttpServer() as Server);

  async function signup(email: string): Promise<{ token: string; userId: string }> {
    const res = await http()
      .post('/api/auth/signup')
      .send({ email, password: 'pass-1234' })
      .expect(201);
    const body = res.body as { token: string; user: { id: string } };
    return { token: body.token, userId: body.user.id };
  }

  const create = (token: string, body: unknown) =>
    http().post('/api/cover-letters').set('Authorization', `Bearer ${token}`).send(body as object);

  const patch = (token: string, id: string, body: unknown) =>
    http().patch(`/api/cover-letters/${id}`).set('Authorization', `Bearer ${token}`).send(body as object);

  const list = async (token: string): Promise<CoverLetterBody[]> => {
    const res = await http().get('/api/cover-letters').set('Authorization', `Bearer ${token}`).expect(200);
    return (res.body as { coverLetters: CoverLetterBody[] }).coverLetters;
  };

  async function createOk(token: string, body: unknown): Promise<CoverLetterBody> {
    const res = await create(token, body);
    expect(res.status).toBe(201);
    return (res.body as { coverLetter: CoverLetterBody }).coverLetter;
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

  let a: { token: string; userId: string };
  let b: { token: string; userId: string };

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
        CoverLettersModule,
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
  }, 120_000);

  beforeEach(async () => {
    fake.reset();
    a = await signup('a@example.com');
    b = await signup('b@example.com');
  });

  afterEach(async () => {
    await connection.collection('users').deleteMany({});
    await connection.collection('coverLetters').deleteMany({});
    await connection.collection('experiences').deleteMany({});
    await connection.collection('facts').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  // 프런트는 새 자소서를 바로 점검 화면에 그리므로 kind·빈 문항·null target이 정확한 키로 와야 한다.
  it('POST returns 201 {coverLetter} as kind pasted with items [] and target null', async () => {
    const res = await create(a.token, { title: 'A사 지원', body: '저는 축제를 운영했습니다.' });

    expect(res.status).toBe(201);
    const body = res.body as { coverLetter: Record<string, unknown> };
    expect(Object.keys(body)).toEqual(['coverLetter']);
    const cl = body.coverLetter as unknown as CoverLetterBody;
    expect(Object.keys(cl).sort()).toEqual(
      ['body', 'createdAt', 'id', 'items', 'kind', 'target', 'title', 'updatedAt'].sort(),
    );
    expect(cl.id).toMatch(/^[0-9a-f]{24}$/);
    expect(cl.kind).toBe('pasted');
    expect(cl.title).toBe('A사 지원');
    expect(cl.body).toBe('저는 축제를 운영했습니다.');
    expect(cl.items).toEqual([]);
    expect(cl.target).toBeNull();
    expect(cl.createdAt).toMatch(ISO);
    expect(cl.updatedAt).toMatch(ISO);
  });

  // 제목은 선택이라 없이 붙여넣어도 저장돼야 한다(api.md 7절 title?).
  it('POST without title returns 201 with title null', async () => {
    const cl = await createOk(a.token, { body: '본문' });
    expect(cl.title).toBeNull();
    expect(cl.kind).toBe('pasted');
  });

  // 빈 자소서는 점검할 문장이 없으므로 저장 전에 막는다(api.md 7절).
  it.each([
    ['empty body', { body: '' }],
    ['whitespace-only body', { body: '   \n\t' }],
    ['missing body', { title: '제목만' }],
    ['non-string body', { body: 123 }],
  ])('POST rejects %s with 400 VALIDATION and saves nothing', async (_label, body) => {
    expectValidation(await create(a.token, body), 'body');
    expect(await list(a.token)).toEqual([]);
  });

  // 목록은 계정별로 분리되고(R1) 방금 고친 것이 맨 앞에 와야 사용자가 이어서 작업할 수 있다.
  it('GET lists only my cover letters, most recently updated first', async () => {
    const first = await createOk(a.token, { title: '첫째', body: '하나' });
    await sleep(10);
    const second = await createOk(a.token, { title: '둘째', body: '둘' });
    await createOk(b.token, { title: 'B 것', body: '남의 글' });

    expect((await list(a.token)).map((c) => c.id)).toEqual([second.id, first.id]);

    await sleep(10);
    expect((await patch(a.token, first.id, { title: '첫째 수정' })).status).toBe(200);
    expect((await list(a.token)).map((c) => c.id)).toEqual([first.id, second.id]);

    const others = await list(b.token);
    expect(others).toHaveLength(1);
    expect(others.map((c) => c.id)).not.toContain(first.id);
  });

  // 점검 결과를 보고 사용자가 직접 고친 글이 저장되고, 수정 시각이 올라 목록·오래됨 판단에 쓰인다(C4).
  it('PATCH updates title or body alone and bumps updatedAt', async () => {
    const cl = await createOk(a.token, { title: '원래 제목', body: '원래 본문' });
    await sleep(10);

    const r1 = await patch(a.token, cl.id, { title: '새 제목' });
    expect(r1.status).toBe(200);
    const after1 = (r1.body as { coverLetter: CoverLetterBody }).coverLetter;
    expect(after1.title).toBe('새 제목');
    expect(after1.body).toBe('원래 본문');
    expect(new Date(after1.updatedAt).getTime()).toBeGreaterThan(new Date(cl.updatedAt).getTime());

    await sleep(10);
    const r2 = await patch(a.token, cl.id, { body: '고친 본문' });
    expect(r2.status).toBe(200);
    const after2 = (r2.body as { coverLetter: CoverLetterBody }).coverLetter;
    expect(after2.title).toBe('새 제목');
    expect(after2.body).toBe('고친 본문');
    expect(new Date(after2.updatedAt).getTime()).toBeGreaterThan(new Date(after1.updatedAt).getTime());
  });

  // 빈 글로 덮어쓰면 점검할 내용이 사라지므로 400으로 막고 원래 글을 지킨다.
  it.each([
    ['empty body', { body: '' }],
    ['whitespace-only body', { body: '  \n ' }],
    ['null body', { body: null }],
  ])('PATCH rejects %s with 400 VALIDATION and keeps the data', async (_label, body) => {
    const cl = await createOk(a.token, { body: '원래 본문' });
    expectValidation(await patch(a.token, cl.id, body), 'body');
    expect((await list(a.token))[0].body).toBe('원래 본문');
  });

  // 생성한 자소서는 문항별 API로만 고친다: body를 받으면 문항 응답과 어긋난 글이 생긴다(api.md 7절).
  it('PATCH with body on a generated cover letter returns 400 and keeps it', async () => {
    const now = new Date();
    const inserted = await connection.collection('coverLetters').insertOne({
      userId: new Types.ObjectId(a.userId),
      kind: 'generated',
      title: '생성',
      body: null,
      target: { preferred: '우대', talent: '인재상' },
      items: [],
      createdAt: now,
      updatedAt: now,
    });
    const id = String(inserted.insertedId);

    expectValidation(await patch(a.token, id, { body: 'x' }), 'body');
    const saved = await connection.collection('coverLetters').findOne({ _id: inserted.insertedId });
    expect(saved?.body).toBeNull();

    // 제목은 생성한 자소서도 고칠 수 있다(body만 막는다).
    const ok = await patch(a.token, id, { title: '새 제목' });
    expect(ok.status).toBe(200);
    expect((ok.body as { coverLetter: CoverLetterBody }).coverLetter.title).toBe('새 제목');
  });

  // 남의 자소서·없는 id·잘못된 id를 같은 404로 돌려줘야 다른 사용자의 자소서가 있는지조차 알 수 없다(R1).
  it('PATCH 404s for others, missing ids and malformed ids without changing data', async () => {
    const cl = await createOk(a.token, { title: '내 것', body: '내 글' });

    expectNotFound(await patch(b.token, cl.id, { title: '탈취' }));
    expectNotFound(await patch(a.token, '0123456789abcdef01234567', { title: 'x' }));
    expectNotFound(await patch(a.token, 'abc', { title: 'x' }));
    expect((await list(a.token))[0].title).toBe('내 것');
  });

  const generate = (token: string, body: unknown) =>
    http().post('/api/cover-letters/generate').set('Authorization', `Bearer ${token}`).send(body as object);

  interface ItemBody {
    id: string;
    question: string;
    answer: string | null;
    recommendations: unknown[];
    selectedExperienceIds: unknown[];
    usedExperienceIds: unknown[];
    answerEdited: boolean;
  }

  // 문항별 추천→선택→응답(R8)은 빈 문항에서 출발해야 하고, 응답은 사용자가 .../answer를 부를 때만 생긴다(C4).
  it('POST /generate returns 201 kind generated with empty items per question and no AI call', async () => {
    const res = await generate(a.token, {
      title: 'A',
      preferred: '우대',
      talent: '인재',
      questions: ['문항1', '문항2'],
    });

    expect(res.status).toBe(201);
    const body = res.body as { coverLetter: CoverLetterBody };
    expect(Object.keys(body)).toEqual(['coverLetter']);
    const cl = body.coverLetter;
    expect(cl.kind).toBe('generated');
    expect(cl.title).toBe('A');
    expect(cl.body).toBeNull();
    expect(cl.target).toEqual({ preferred: '우대', talent: '인재' });
    expect(cl.createdAt).toMatch(ISO);
    const items = cl.items as ItemBody[];
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.question)).toEqual(['문항1', '문항2']);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'answer',
          'answerEdited',
          'id',
          'question',
          'recommendations',
          'selectedExperienceIds',
          'usedExperienceIds',
        ].sort(),
      );
      expect(item.id).toMatch(/^[0-9a-f]{24}$/);
      expect(item.answer).toBeNull();
      expect(item.recommendations).toEqual([]);
      expect(item.selectedExperienceIds).toEqual([]);
      expect(item.usedExperienceIds).toEqual([]);
      expect(item.answerEdited).toBe(false);
    }
    expect(items[0].id).not.toBe(items[1].id);
    expect(fake.calls).toHaveLength(0);

    // 만든 자소서는 내 목록에서 이어서 작업할 수 있어야 하고 남에게는 보이지 않는다(R1·R7).
    expect((await list(a.token)).map((c) => c.id)).toEqual([cl.id]);
    expect(await list(b.token)).toEqual([]);
  });

  // 제목은 선택이다(api.md 7절 title?).
  it('POST /generate without title returns 201 with title null', async () => {
    const res = await generate(a.token, { preferred: '우대', talent: '인재', questions: ['문항'] });
    expect(res.status).toBe(201);
    expect((res.body as { coverLetter: CoverLetterBody }).coverLetter.title).toBeNull();
  });

  // 우대사항·인재상·문항이 비면 추천·응답 AI 입력이 비어 쓸모없는 자소서가 생기므로 저장 전에 막는다(api.md 7절).
  const valid = { preferred: '우대', talent: '인재', questions: ['문항'] };
  it.each([
    ['empty preferred', { ...valid, preferred: '' }, 'preferred'],
    ['whitespace preferred', { ...valid, preferred: '   ' }, 'preferred'],
    ['missing preferred', { talent: '인재', questions: ['문항'] }, 'preferred'],
    ['empty talent', { ...valid, talent: '' }, 'talent'],
    ['whitespace talent', { ...valid, talent: ' \n ' }, 'talent'],
    ['missing talent', { preferred: '우대', questions: ['문항'] }, 'talent'],
    ['zero questions', { ...valid, questions: [] }, 'questions'],
    ['missing questions', { preferred: '우대', talent: '인재' }, 'questions'],
    ['non-array questions', { ...valid, questions: '문항' }, 'questions'],
    ['blank question', { ...valid, questions: ['문항', '  '] }, 'questions'],
    ['non-string question', { ...valid, questions: ['문항', 3] }, 'questions'],
  ])('POST /generate rejects %s with 400 VALIDATION and saves nothing', async (_label, body, field) => {
    expectValidation(await generate(a.token, body), field);
    expect(await connection.collection('coverLetters').countDocuments()).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });

  // 추천 테스트용 경험·사실은 컬렉션에 바로 넣는다: 이 주장은 경험 API가 아니라 추천 입력·필터를 검사한다.
  async function insertExperience(userId: string, title: string): Promise<string> {
    const now = new Date();
    const res = await connection.collection('experiences').insertOne({
      userId: new Types.ObjectId(userId),
      title,
      period: '2025',
      itemStatus: { situation: null, role: null, action: null, result: null, meaning: null },
      createdAt: now,
      updatedAt: now,
    });
    return String(res.insertedId);
  }

  async function insertFact(userId: string, expId: string, text: string, status: 'confirmed' | 'candidate') {
    await connection.collection('facts').insertOne({
      experienceId: new Types.ObjectId(expId),
      userId: new Types.ObjectId(userId),
      item: 'action',
      text,
      status,
      source: status === 'confirmed' ? 'said' : 'ai_unverified',
      clueId: null,
      origin: 'manual',
      createdAt: new Date(),
    });
  }

  const recommend = (token: string, id: string, itemId: string) =>
    http()
      .post(`/api/cover-letters/${id}/items/${itemId}/recommendations`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

  async function generated(token: string): Promise<{ id: string; itemId: string }> {
    const res = await generate(token, {
      preferred: '대규모 행사 운영 경험 우대',
      talent: '끝까지 책임지는 사람',
      questions: ['협업으로 문제를 해결한 경험을 쓰시오'],
    });
    expect(res.status).toBe(201);
    const cl = (res.body as { coverLetter: CoverLetterBody }).coverLetter;
    return { id: cl.id, itemId: (cl.items as ItemBody[])[0].id };
  }

  const savedItem = async (token: string, id: string): Promise<ItemBody> =>
    ((await list(token)).find((c) => c.id === id)!.items as ItemBody[])[0];

  // 추천은 확정 사실이 있는 내 카드에서만 나와야 한다(C1·R1): 후보만 있는 카드·남의 카드·AI가 지어낸 id가 섞이면 근거 없는 자소서가 된다.
  it('POST .../recommendations sends only my confirmed cards to AI and drops ids outside that set', async () => {
    const e1 = await insertExperience(a.userId, '축제 운영');
    await insertFact(a.userId, e1, '부스 동선을 다시 짰다', 'confirmed');
    await insertFact(a.userId, e1, '대기 시간이 절반으로 줄었다', 'candidate');
    const e2 = await insertExperience(a.userId, '후보만 있는 동아리');
    await insertFact(a.userId, e2, '동아리 회장을 맡았다', 'candidate');
    const e3 = await insertExperience(b.userId, 'B의 인턴');
    await insertFact(b.userId, e3, 'B가 확정한 사실', 'confirmed');
    const { id, itemId } = await generated(a.token);
    const ghost = '0123456789abcdef01234567';

    fake.queue('cover-letter-recommend', {
      recommendations: [
        { experienceId: e1, reason: '행사 운영 경험이 우대사항과 맞아요' },
        { experienceId: e2, reason: 'x' },
        { experienceId: e3, reason: 'y' },
        { experienceId: ghost, reason: 'z' },
        { experienceId: 'bad', reason: 'w' },
      ],
    });
    const res = await recommend(a.token, id, itemId);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object)).toEqual(['item']);
    const item = (res.body as { item: ItemBody }).item;
    expect(item.id).toBe(itemId);
    expect(item.recommendations).toEqual([{ experienceId: e1, reason: '행사 운영 경험이 우대사항과 맞아요' }]);
    // 추천은 응답을 만들지 않는다(C4).
    expect(item.answer).toBeNull();
    expect(item.answerEdited).toBe(false);
    expect((await savedItem(a.token, id)).recommendations).toEqual(item.recommendations);

    expect(fake.calls).toHaveLength(1);
    const input = fake.calls[0].user;
    const present = [e1, '축제 운영', '부스 동선을 다시 짰다', '대규모 행사 운영 경험 우대', '끝까지 책임지는 사람', '협업으로 문제를 해결한 경험을 쓰시오'];
    for (const text of present) expect(input).toContain(text);
    const absent = [e2, e3, '후보만 있는 동아리', '동아리 회장을 맡았다', '대기 시간이 절반으로 줄었다', 'B가 확정한 사실'];
    for (const text of absent) expect(input).not.toContain(text);
  });

  // 고를 카드가 없으면 추천 비용을 쓸 이유가 없다: AI 전에 400으로 알려 경험 정리로 안내한다(api.md 7절).
  it('POST .../recommendations returns 400 NO_CONFIRMED_FACTS without calling AI when I have no confirmed cards', async () => {
    const e1 = await insertExperience(a.userId, '후보만');
    await insertFact(a.userId, e1, '후보 문장', 'candidate');
    const e3 = await insertExperience(b.userId, 'B 것');
    await insertFact(b.userId, e3, 'B 확정', 'confirmed');
    const { id, itemId } = await generated(a.token);

    const res = await recommend(a.token, id, itemId);
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('NO_CONFIRMED_FACTS');
    expect(fake.calls).toHaveLength(0);
    expect((await savedItem(a.token, id)).recommendations).toEqual([]);
  });

  // AI가 실패하거나 스키마 밖을 돌려주면 이전 추천을 지켜야 한다(C2): 반쯤 바뀐 추천은 사용자를 헷갈리게 한다.
  it('POST .../recommendations returns 502 and keeps the item when AI fails or returns an off-schema reply', async () => {
    const e1 = await insertExperience(a.userId, '축제 운영');
    await insertFact(a.userId, e1, '부스 동선을 다시 짰다', 'confirmed');
    const { id, itemId } = await generated(a.token);

    fake.fail('cover-letter-recommend');
    const r1 = await recommend(a.token, id, itemId);
    expect(r1.status).toBe(502);
    expect((r1.body as ErrorBody).error.code).toBe('AI_UNAVAILABLE');
    expect((await savedItem(a.token, id)).recommendations).toEqual([]);

    fake.queue('cover-letter-recommend', { recommendations: [{ experienceId: e1, reason: '첫 추천' }] });
    expect((await recommend(a.token, id, itemId)).status).toBe(200);

    fake.queue('cover-letter-recommend', { recommendations: [{ experienceId: e1 }] });
    const r2 = await recommend(a.token, id, itemId);
    expect(r2.status).toBe(502);
    expect((await savedItem(a.token, id)).recommendations).toEqual([{ experienceId: e1, reason: '첫 추천' }]);
  });

  // 남의 자소서·없는 문항·잘못된 id를 같은 404로 돌려 존재 여부가 새지 않게 하고, AI 비용도 쓰지 않는다(R1).
  it('POST .../recommendations 404s for others, missing items and malformed ids without calling AI', async () => {
    const e1 = await insertExperience(b.userId, 'B 카드');
    await insertFact(b.userId, e1, 'B 확정', 'confirmed');
    const { id, itemId } = await generated(a.token);

    expectNotFound(await recommend(b.token, id, itemId));
    expectNotFound(await recommend(a.token, id, '0123456789abcdef01234567'));
    expectNotFound(await recommend(a.token, id, 'bad'));
    expectNotFound(await recommend(a.token, 'bad', itemId));
    expectNotFound(await recommend(a.token, '0123456789abcdef01234567', itemId));
    expect(fake.calls).toHaveLength(0);
    expect((await http().post(`/api/cover-letters/${id}/items/${itemId}/recommendations`)).status).toBe(401);
  });

  // 로그인 전에는 기능을 쓸 수 없다(C3).
  it('requires a token on every route', async () => {
    expect((await http().post('/api/cover-letters/generate').send(valid)).status).toBe(401);
    expect((await http().post('/api/cover-letters').send({ body: 'x' })).status).toBe(401);
    expect((await http().get('/api/cover-letters')).status).toBe(401);
    expect((await http().patch('/api/cover-letters/0123456789abcdef01234567').send({ title: 'x' })).status).toBe(
      401,
    );
  });
});
