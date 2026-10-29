import { Server } from 'node:http';
import * as os from 'node:os';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { UsersModule } from '../users/users.module';
import { ExperiencesModule } from './experiences.module';

const ITEMS = ['situation', 'role', 'action', 'result', 'meaning'];

interface ExperienceBody {
  id: string;
  title: string;
  period: string;
  clues: unknown[];
  itemStatus: Record<string, unknown>;
  card: Record<string, unknown[]>;
  candidates: unknown[];
  createdAt: string;
  updatedAt: string;
}

interface ErrorBody {
  error: { code: string; message: string; details?: { field: string; reason: string }[] };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 경험은 모든 기능(대화·사실·자소서)의 바탕이라, 모양이 api.md 2절과 다르거나 남의 경험이 보이면 이후 단계가 전부 틀어진다(R1·R2·R6).
describe('C5-1 /api/experiences create·list·get·patch', () => {
  const savedSecret = process.env.JWT_SECRET;
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let connection: Connection;
  const http = () => request(app.getHttpServer() as Server);

  async function signup(email: string): Promise<string> {
    const res = await http()
      .post('/api/auth/signup')
      .send({ email, password: 'pass-1234' })
      .expect(201);
    return (res.body as { token: string }).token;
  }

  async function create(token: string, body: unknown): Promise<request.Response> {
    return http().post('/api/experiences').set('Authorization', `Bearer ${token}`).send(body as object);
  }

  async function createOk(token: string, title: string, period = '2025년 여름'): Promise<ExperienceBody> {
    const res = await create(token, { title, period });
    expect(res.status).toBe(201);
    return (res.body as { experience: ExperienceBody }).experience;
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

  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    mongod = await MongoMemoryServer.create();
    // 운영 createApp과 같은 prefix·오류 필터로 띄워 실제 경로·본문을 검증한다.
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
        ExperiencesModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api', { exclude: ['__health'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    await connection.model('User').syncIndexes();
  }, 120_000);

  beforeEach(async () => {
    tokenA = await signup('a@example.com');
    tokenB = await signup('b@example.com');
  });

  afterEach(async () => {
    await connection.collection('users').deleteMany({});
    await connection.collection('experiences').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  // 프런트는 새 경험을 바로 카드·대화 화면에 그리므로 빈 단서·null 상태·빈 카드가 정확한 키로 와야 한다.
  it('POST returns 201 {experience} in the api.md section 2 shape', async () => {
    const res = await create(tokenA, { title: '  동아리 축제 운영  ', period: '2025년 여름' });

    expect(res.status).toBe(201);
    const body = res.body as { experience: Record<string, unknown> };
    expect(Object.keys(body)).toEqual(['experience']);
    const exp = body.experience as unknown as ExperienceBody;
    expect(Object.keys(exp).sort()).toEqual(
      ['candidates', 'card', 'clues', 'createdAt', 'id', 'itemStatus', 'period', 'title', 'updatedAt'].sort(),
    );
    expect(exp.id).toMatch(/^[0-9a-f]{24}$/);
    expect(exp.title).toBe('동아리 축제 운영');
    expect(exp.period).toBe('2025년 여름');
    expect(exp.clues).toEqual([]);
    expect(exp.itemStatus).toEqual(Object.fromEntries(ITEMS.map((i) => [i, null])));
    expect(exp.card).toEqual(Object.fromEntries(ITEMS.map((i) => [i, []])));
    expect(exp.candidates).toEqual([]);
    expect(exp.createdAt).toMatch(ISO);
    expect(exp.updatedAt).toMatch(ISO);
  });

  // 제목·시기가 비면 카드 목록에서 구분할 수 없어 저장 전에 칸을 짚어 400으로 돌려보낸다.
  it.each([
    ['title missing', { period: '2025년' }, 'title'],
    ['period missing', { title: '축제' }, 'period'],
    ['title blank', { title: '   ', period: '2025년' }, 'title'],
    ['period blank', { title: '축제', period: '  ' }, 'period'],
    ['title not a string', { title: 123, period: '2025년' }, 'title'],
    ['period not a string', { title: '축제', period: ['2025'] }, 'period'],
  ])('POST rejects %s with 400 VALIDATION', async (_label, body, field) => {
    expectValidation(await create(tokenA, body), field);
    expect(await connection.collection('experiences').countDocuments()).toBe(0);
  });

  // 전역 가드가 경험 API에도 걸려야 로그인 전 사용자가 데이터를 만들거나 볼 수 없다(C3).
  it('requires a token for POST and GET', async () => {
    const post = await http().post('/api/experiences').send({ title: '축제', period: '2025년' });
    expect(post.status).toBe(401);
    const list = await http().get('/api/experiences');
    expect(list.status).toBe(401);
  });

  // 목록은 내 것만, 방금 고친 경험이 맨 앞이어야 이어서 작업할 카드를 바로 찾는다(R1·R6).
  it('GET lists only my experiences, most recently updated first', async () => {
    const first = await createOk(tokenA, '첫 번째');
    await sleep(15);
    const second = await createOk(tokenA, '두 번째');
    await createOk(tokenB, 'B의 경험');

    let res = await http().get('/api/experiences').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    let ids = (res.body as { experiences: ExperienceBody[] }).experiences.map((e) => e.id);
    expect(ids).toEqual([second.id, first.id]);

    await sleep(15);
    await http()
      .patch(`/api/experiences/${first.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: '첫 번째(수정)' })
      .expect(200);

    res = await http().get('/api/experiences').set('Authorization', `Bearer ${tokenA}`);
    const list = (res.body as { experiences: ExperienceBody[] }).experiences;
    ids = list.map((e) => e.id);
    expect(ids).toEqual([first.id, second.id]);
    // 목록 항목도 상세와 같은 모양이어야 프런트가 한 가지 타입으로 그린다.
    expect(list[0].card).toEqual(Object.fromEntries(ITEMS.map((i) => [i, []])));

    const resB = await http().get('/api/experiences').set('Authorization', `Bearer ${tokenB}`);
    const titlesB = (resB.body as { experiences: ExperienceBody[] }).experiences.map((e) => e.title);
    expect(titlesB).toEqual(['B의 경험']);
  });

  // 상세는 내 것만 200이고, 남의 것·없는 것·형식이 틀린 id는 모두 같은 404여야 존재 여부가 새지 않는다(R1).
  it('GET /:id returns mine and 404s for others, missing ids and malformed ids', async () => {
    const mine = await createOk(tokenA, '내 경험');

    const ok = await http().get(`/api/experiences/${mine.id}`).set('Authorization', `Bearer ${tokenA}`);
    expect(ok.status).toBe(200);
    expect((ok.body as { experience: ExperienceBody }).experience).toEqual(mine);

    expectNotFound(await http().get(`/api/experiences/${mine.id}`).set('Authorization', `Bearer ${tokenB}`));
    expectNotFound(
      await http().get('/api/experiences/0123456789abcdef01234567').set('Authorization', `Bearer ${tokenA}`),
    );
    expectNotFound(await http().get('/api/experiences/abc').set('Authorization', `Bearer ${tokenA}`));
  });

  // 제목·시기는 따로 고칠 수 있어야 하고, 고치면 updatedAt이 바뀌어야 목록 순서가 맞는다(R6).
  it('PATCH updates title or period alone and bumps updatedAt', async () => {
    const exp = await createOk(tokenA, '원래 제목', '2024년');
    await sleep(15);

    const r1 = await http()
      .patch(`/api/experiences/${exp.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: '  새 제목 ' });
    expect(r1.status).toBe(200);
    const e1 = (r1.body as { experience: ExperienceBody }).experience;
    expect(e1.title).toBe('새 제목');
    expect(e1.period).toBe('2024년');
    expect(Date.parse(e1.updatedAt)).toBeGreaterThan(Date.parse(exp.updatedAt));
    expect(e1.createdAt).toBe(exp.createdAt);

    await sleep(15);
    const r2 = await http()
      .patch(`/api/experiences/${exp.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ period: '2025년 봄' });
    expect(r2.status).toBe(200);
    const e2 = (r2.body as { experience: ExperienceBody }).experience;
    expect(e2.title).toBe('새 제목');
    expect(e2.period).toBe('2025년 봄');
    expect(Date.parse(e2.updatedAt)).toBeGreaterThan(Date.parse(e1.updatedAt));
  });

  // 빈 값으로 고치면 이름 없는 카드가 생기므로 저장하지 않고 400으로 막는다.
  it.each([
    ['empty title', { title: '' }, 'title'],
    ['blank title', { title: '  ' }, 'title'],
    ['empty period', { period: '' }, 'period'],
    ['blank period', { period: '   ' }, 'period'],
    ['null title', { title: null }, 'title'],
  ])('PATCH rejects %s with 400 VALIDATION and keeps the data', async (_label, body, field) => {
    const exp = await createOk(tokenA, '그대로', '2024년');

    expectValidation(
      await http().patch(`/api/experiences/${exp.id}`).set('Authorization', `Bearer ${tokenA}`).send(body),
      field,
    );

    const after = await http().get(`/api/experiences/${exp.id}`).set('Authorization', `Bearer ${tokenA}`);
    expect((after.body as { experience: ExperienceBody }).experience).toEqual(exp);
  });

  // 남의 경험을 고칠 수 있으면 계정 분리가 깨진다. 없는 id·잘못된 형식도 500이 아니라 404여야 한다(R1).
  it('PATCH 404s for others, missing ids and malformed ids without changing data', async () => {
    const exp = await createOk(tokenA, 'A 것', '2024년');

    expectNotFound(
      await http()
        .patch(`/api/experiences/${exp.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: '가로채기' }),
    );
    expectNotFound(
      await http()
        .patch('/api/experiences/0123456789abcdef01234567')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'x' }),
    );
    expectNotFound(
      await http().patch('/api/experiences/abc').set('Authorization', `Bearer ${tokenA}`).send({ title: 'x' }),
    );

    const after = await http().get(`/api/experiences/${exp.id}`).set('Authorization', `Bearer ${tokenA}`);
    expect((after.body as { experience: ExperienceBody }).experience.title).toBe('A 것');
  });
});
