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
import { CoverLettersModule } from '../cover-letters/cover-letters.module';
import { UsersModule } from '../users/users.module';
import { ChecksModule } from './checks.module';

interface SentenceBody {
  id: string;
  text: string;
  coverLetterItemId: string | null;
  status: string;
  turns: unknown[];
  followUpsLeft: number;
}

interface CheckBody {
  id: string;
  coverLetterId: string;
  stale: boolean;
  sentences: SentenceBody[];
  candidates: unknown[];
  createdAt: string;
}

interface ErrorBody {
  error: { code: string };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 점검(R9)은 문장별 근거 묻기의 출발점이다. 원문에 없는 문장이 섞이거나 남의 점검이 보이면
// 사용자가 쓰지 않은 주장을 해명하게 되고(C4), 계정 분리(R1)가 깨진다.
describe('C8-1 /api/cover-letters/:id/checks create·get·list', () => {
  const savedSecret = process.env.JWT_SECRET;
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let connection: Connection;
  const fake = new FakeAiService();
  const http = () => request(app.getHttpServer() as Server);

  async function signup(email: string): Promise<{ token: string; userId: string }> {
    const res = await http().post('/api/auth/signup').send({ email, password: 'pass-1234' }).expect(201);
    const body = res.body as { token: string; user: { id: string } };
    return { token: body.token, userId: body.user.id };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const BODY = '저는 축제 운영팀장으로 방문객을 30% 늘렸습니다. 팀원들과 매주 회의를 했습니다.';

  async function pasted(token: string, body = BODY): Promise<string> {
    const res = await http().post('/api/cover-letters').set(auth(token)).send({ title: 'A사', body }).expect(201);
    return (res.body as { coverLetter: { id: string } }).coverLetter.id;
  }

  // 생성한 자소서: 문항 둘 중 첫째만 응답이 있고 둘째는 null이다(null 문항은 AI 입력에서 빠져야 한다).
  async function generated(token: string): Promise<{ id: string; itemIds: string[] }> {
    const res = await http()
      .post('/api/cover-letters/generate')
      .set(auth(token))
      .send({ title: 'B사', preferred: '데이터 분석', talent: '협업', questions: ['지원 동기', '협업 경험'] })
      .expect(201);
    const cl = (res.body as { coverLetter: { id: string; items: { id: string }[] } }).coverLetter;
    return { id: cl.id, itemIds: cl.items.map((i) => i.id) };
  }

  async function setAnswer(token: string, id: string, itemId: string, answer: string): Promise<void> {
    await http().patch(`/api/cover-letters/${id}/items/${itemId}`).set(auth(token)).send({ answer }).expect(200);
  }

  const createCheck = (token: string, id: string) => http().post(`/api/cover-letters/${id}/checks`).set(auth(token));
  const listChecks = (token: string, id: string) => http().get(`/api/cover-letters/${id}/checks`).set(auth(token));
  const getCheck = (token: string, checkId: string) => http().get(`/api/checks/${checkId}`).set(auth(token));

  async function createOk(token: string, id: string): Promise<CheckBody> {
    const res = await createCheck(token, id);
    expect(res.status).toBe(201);
    return (res.body as { check: CheckBody }).check;
  }

  const expectNotFound = (res: request.Response) => {
    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error.code).toBe('NOT_FOUND');
  };

  let a: { token: string; userId: string };
  let b: { token: string; userId: string };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
        AiModule,
        CoverLettersModule,
        ChecksModule,
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
    await connection.collection('checks').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  // AI가 지어낸 문장을 점검 목록에 올리면 사용자가 쓰지 않은 주장을 해명하게 된다: 원문에 있는 문장만 남아야 한다.
  it('POST on a pasted letter returns 201 {check} with only sentences found verbatim in the body', async () => {
    const id = await pasted(a.token);
    fake.queue('check-sentences', {
      sentences: [
        { text: '저는 축제 운영팀장으로 방문객을 30% 늘렸습니다.', coverLetterItemId: null },
        { text: '저는 매출을 두 배로 올렸습니다.', coverLetterItemId: null },
      ],
    });

    const res = await createCheck(a.token, id);

    expect(res.status).toBe(201);
    expect(Object.keys(res.body as object)).toEqual(['check']);
    const check = (res.body as { check: CheckBody }).check;
    expect(Object.keys(check).sort()).toEqual(
      ['candidates', 'coverLetterId', 'createdAt', 'id', 'sentences', 'stale'].sort(),
    );
    expect(check.coverLetterId).toBe(id);
    expect(check.stale).toBe(false);
    expect(check.candidates).toEqual([]);
    expect(check.createdAt).toMatch(ISO);
    expect(Types.ObjectId.isValid(check.id)).toBe(true);
    expect(check.sentences).toHaveLength(1);
    const [sentence] = check.sentences;
    expect(sentence).toEqual({
      id: expect.any(String) as string,
      text: '저는 축제 운영팀장으로 방문객을 30% 늘렸습니다.',
      coverLetterItemId: null,
      status: 'pending',
      turns: [],
      followUpsLeft: 3,
    });
    // 붙여넣은 자소서는 body를 AI 입력으로 보낸다.
    const call = fake.calls.find((c) => c.task === 'check-sentences');
    expect(call?.user).toContain(BODY);
  });

  // 문장마다 고유 id가 있어야 이후 start·answers 경로가 문장을 하나씩 가리킬 수 있다.
  it('gives every sentence a distinct id', async () => {
    const id = await pasted(a.token);
    fake.queue('check-sentences', {
      sentences: [
        { text: '저는 축제 운영팀장으로 방문객을 30% 늘렸습니다.', coverLetterItemId: null },
        { text: '팀원들과 매주 회의를 했습니다.', coverLetterItemId: null },
      ],
    });
    const check = await createOk(a.token, id);
    expect(check.sentences).toHaveLength(2);
    expect(new Set(check.sentences.map((s) => s.id)).size).toBe(2);
  });

  // AI가 문항 id를 틀려도 서버가 문장이 실제로 든 문항으로 바로잡아야 점검 결과가 맞는 문항에 붙는다.
  it('POST on a generated letter re-links each sentence to the item that actually contains it and skips null answers', async () => {
    const { id, itemIds } = await generated(a.token);
    await setAnswer(a.token, id, itemIds[0], '저는 분석 동아리에서 리포트 10건을 썼습니다.');
    fake.queue('check-sentences', {
      sentences: [
        { text: '저는 분석 동아리에서 리포트 10건을 썼습니다.', coverLetterItemId: itemIds[1] },
        { text: '리포트 10건', coverLetterItemId: null },
        { text: '협업으로 상을 받았습니다.', coverLetterItemId: itemIds[1] },
      ],
    });

    const check = await createOk(a.token, id);

    expect(check.sentences.map((s) => [s.text, s.coverLetterItemId])).toEqual([
      ['저는 분석 동아리에서 리포트 10건을 썼습니다.', itemIds[0]],
      ['리포트 10건', itemIds[0]],
    ]);
    // answer가 null인 문항은 AI 입력에 들어가지 않는다(고를 글이 없다).
    const call = fake.calls.find((c) => c.task === 'check-sentences');
    expect(call?.user).toContain(itemIds[0]);
    expect(call?.user).not.toContain(itemIds[1]);
  });

  // 고를 문장이 없어도 점검은 만들어져야 프런트가 "점검할 문장 없음"을 보여 줄 수 있다(api.md 9절).
  it('returns 201 with sentences [] when the AI picks nothing', async () => {
    const id = await pasted(a.token);
    fake.queue('check-sentences', { sentences: [] });
    const check = await createOk(a.token, id);
    expect(check.sentences).toEqual([]);
  });

  // AI 실패 시 빈 점검이 남으면 사용자가 문장 없는 점검을 결과로 오해한다(C2): 502이고 아무것도 저장하지 않는다.
  it('returns 502 AI_UNAVAILABLE and stores no check when the AI fails or answers off-schema', async () => {
    const id = await pasted(a.token);
    fake.fail('check-sentences');
    const failed = await createCheck(a.token, id);
    expect(failed.status).toBe(502);
    expect((failed.body as ErrorBody).error.code).toBe('AI_UNAVAILABLE');

    fake.queue('check-sentences', { sentences: [{ text: 123 }] });
    const offSchema = await createCheck(a.token, id);
    expect(offSchema.status).toBe(502);

    const list = await listChecks(a.token, id).expect(200);
    expect((list.body as { checks: CheckBody[] }).checks).toEqual([]);
    expect(await connection.collection('checks').countDocuments()).toBe(0);
  });

  // 새로고침 뒤 프런트가 가장 최근 점검을 다시 찾으므로 최신순이어야 하고, 단건 조회도 같은 모양이어야 한다(R11).
  it('GET /cover-letters/:id/checks lists newest first and GET /checks/:checkId returns {check}', async () => {
    const id = await pasted(a.token);
    fake.queue('check-sentences', { sentences: [] }, { sentences: [] });
    const first = await createOk(a.token, id);
    await sleep(5);
    const second = await createOk(a.token, id);

    const list = await listChecks(a.token, id).expect(200);
    expect(Object.keys(list.body as object)).toEqual(['checks']);
    expect((list.body as { checks: CheckBody[] }).checks.map((c) => c.id)).toEqual([second.id, first.id]);

    const one = await getCheck(a.token, first.id).expect(200);
    expect(one.body).toEqual({ check: first });
  });

  // 남의 자소서·점검은 있는지조차 알 수 없어야 한다(R1): 없는 것·잘못된 id와 같은 404, AI도 부르지 않는다.
  it('returns 404 for another user’s or missing resources and 401 without a token', async () => {
    const id = await pasted(a.token);
    fake.queue('check-sentences', { sentences: [] });
    const check = await createOk(a.token, id);
    fake.reset();

    expectNotFound(await createCheck(b.token, id));
    expectNotFound(await listChecks(b.token, id));
    expectNotFound(await getCheck(b.token, check.id));
    expectNotFound(await createCheck(a.token, new Types.ObjectId().toHexString()));
    expectNotFound(await listChecks(a.token, 'not-an-id'));
    expectNotFound(await getCheck(a.token, new Types.ObjectId().toHexString()));
    expectNotFound(await getCheck(a.token, 'not-an-id'));
    expect(fake.calls).toEqual([]);

    expect((await http().post(`/api/cover-letters/${id}/checks`)).status).toBe(401);
    expect((await http().get(`/api/cover-letters/${id}/checks`)).status).toBe(401);
    expect((await http().get(`/api/checks/${check.id}`)).status).toBe(401);
  });

  // 점검은 자소서를 고쳐 쓰지 않는다(C4): 만든 뒤에도 본문·응답이 그대로여야 한다.
  it('does not change the cover letter body or answers', async () => {
    const id = await pasted(a.token);
    const before = await http().get(`/api/cover-letters/${id}`).set(auth(a.token)).expect(200);
    fake.queue('check-sentences', {
      sentences: [{ text: '팀원들과 매주 회의를 했습니다.', coverLetterItemId: null }],
    });
    await createOk(a.token, id);
    const after = await http().get(`/api/cover-letters/${id}`).set(auth(a.token)).expect(200);
    expect(after.body).toEqual(before.body);
  });
});
