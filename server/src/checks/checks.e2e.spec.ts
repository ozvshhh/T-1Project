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

  // 문장별 근거 묻기(R10)는 start로 시작한다. 자소서가 바뀐 뒤 옛 점검으로 이어 가면 지금 글과 다른 문장을 해명하게 된다.
  describe('C8-2 sentence start and stale checks', () => {
    const SENTENCE = '저는 축제 운영팀장으로 방문객을 30% 늘렸습니다.';
    const OTHER = '팀원들과 매주 회의를 했습니다.';

    const start = (token: string, checkId: string, sentenceId: string) =>
      http().post(`/api/checks/${checkId}/sentences/${sentenceId}/start`).set(auth(token));
    const answers = (token: string, checkId: string, sentenceId: string) =>
      http().post(`/api/checks/${checkId}/sentences/${sentenceId}/answers`).set(auth(token)).send({ text: '답' });

    async function pastedCheck(token: string): Promise<{ id: string; check: CheckBody }> {
      const id = await pasted(token);
      fake.queue('check-sentences', {
        sentences: [
          { text: SENTENCE, coverLetterItemId: null },
          { text: OTHER, coverLetterItemId: null },
        ],
      });
      return { id, check: await createOk(token, id) };
    }

    const expectStale = (res: request.Response) => {
      expect(res.status).toBe(409);
      expect((res.body as ErrorBody).error.code).toBe('CHECK_STALE');
    };

    afterEach(async () => {
      await connection.collection('experiences').deleteMany({});
      await connection.collection('facts').deleteMany({});
    });

    // 첫 질문이 turn으로 남아야 새로고침 뒤에도 같은 질문에 답할 수 있다(R11).
    it('start appends the first question as a turn and marks the sentence in_progress', async () => {
      const { check } = await pastedCheck(a.token);
      const target = check.sentences[0];
      fake.queue('check-question', { question: 'Q1' });

      const res = await start(a.token, check.id, target.id);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body as object)).toEqual(['sentence']);
      const sentence = (res.body as { sentence: SentenceBody }).sentence;
      expect(sentence).toEqual({
        id: target.id,
        text: SENTENCE,
        coverLetterItemId: null,
        status: 'in_progress',
        turns: [{ question: 'Q1', answer: null, judge: [] }],
        followUpsLeft: 3,
      });
      // AI에는 고른 문장과 그 문맥(원문)이 들어가야 맥락에 맞는 질문이 나온다.
      const call = fake.calls.find((c) => c.task === 'check-question');
      expect(call?.user).toContain(SENTENCE);
      expect(call?.user).toContain(BODY);

      const saved = (await getCheck(a.token, check.id).expect(200)).body as { check: CheckBody };
      expect(saved.check.sentences[0]).toEqual(sentence);
      // 다른 문장은 시작하지 않았으므로 그대로다(서버가 자동으로 넘기지 않는다).
      expect(saved.check.sentences[1].status).toBe('pending');
    });

    // 같은 문장을 다시 시작해도 질문이 겹치거나 AI 비용이 더 들면 안 된다.
    it('start on an already started sentence returns it unchanged without calling the AI', async () => {
      const { check } = await pastedCheck(a.token);
      const target = check.sentences[0];
      fake.queue('check-question', { question: 'Q1' });
      const first = (await start(a.token, check.id, target.id).expect(200)).body as { sentence: SentenceBody };
      const callsBefore = fake.calls.length;

      const again = await start(a.token, check.id, target.id);

      expect(again.status).toBe(200);
      expect(again.body).toEqual(first);
      expect(fake.calls).toHaveLength(callsBefore);
    });

    // AI가 실패했는데 문장이 in_progress가 되면 답할 질문 없이 막힌다(C2): 502이고 문장은 그대로다.
    it('start returns 502 and leaves the sentence pending with no turns when the AI fails or answers off-schema', async () => {
      const { check } = await pastedCheck(a.token);
      const target = check.sentences[0];
      fake.fail('check-question');
      const failed = await start(a.token, check.id, target.id);
      expect(failed.status).toBe(502);
      expect((failed.body as ErrorBody).error.code).toBe('AI_UNAVAILABLE');

      fake.queue('check-question', { question: '' });
      expect((await start(a.token, check.id, target.id)).status).toBe(502);

      const saved = (await getCheck(a.token, check.id).expect(200)).body as { check: CheckBody };
      expect(saved.check.sentences[0]).toEqual(target);
    });

    // 남의 점검·문장은 있는지조차 알 수 없어야 한다(R1): 같은 404이고 AI도 부르지 않는다.
    it('start returns 404 for others’ checks and missing or malformed ids, 401 without a token', async () => {
      const { check } = await pastedCheck(a.token);
      const target = check.sentences[0];
      fake.reset();

      expectNotFound(await start(b.token, check.id, target.id));
      expectNotFound(await start(a.token, new Types.ObjectId().toHexString(), target.id));
      expectNotFound(await start(a.token, 'not-an-id', target.id));
      expectNotFound(await start(a.token, check.id, new Types.ObjectId().toHexString()));
      expectNotFound(await start(a.token, check.id, 'not-an-id'));
      expect(fake.calls).toEqual([]);

      expect((await http().post(`/api/checks/${check.id}/sentences/${target.id}/start`)).status).toBe(401);
    });

    // 생성한 자소서는 문장이 든 문항의 질문·응답이 문맥이다(붙여넣은 본문이 없다).
    it('start on a generated letter sends the containing item as context', async () => {
      const { id, itemIds } = await generated(a.token);
      const text = '저는 분석 동아리에서 리포트 10건을 썼습니다.';
      await setAnswer(a.token, id, itemIds[0], text);
      fake.queue('check-sentences', { sentences: [{ text, coverLetterItemId: itemIds[0] }] });
      const check = await createOk(a.token, id);
      fake.queue('check-question', { question: 'Q1' });

      const res = await start(a.token, check.id, check.sentences[0].id).expect(200);

      expect((res.body as { sentence: SentenceBody }).sentence.coverLetterItemId).toBe(itemIds[0]);
      const call = fake.calls.find((c) => c.task === 'check-question');
      expect(call?.user).toContain('지원 동기');
      expect(call?.user).toContain(text);
    });

    // 자소서를 바꾸는 세 API 어느 것이든 그 자소서의 점검을 "모두" 오래됨으로 만들어야 하고, 다른 자소서의 점검은 그대로다.
    it('PATCH cover letter marks every existing check of that letter stale and leaves other letters alone', async () => {
      const { id, check: first } = await pastedCheck(a.token);
      fake.queue('check-sentences', { sentences: [] });
      const second = await createOk(a.token, id);
      const { id: otherId, check: other } = await pastedCheck(a.token);

      await http().patch(`/api/cover-letters/${id}`).set(auth(a.token)).send({ title: '새 제목' }).expect(200);

      const list = (await listChecks(a.token, id).expect(200)).body as { checks: CheckBody[] };
      expect(list.checks.map((c) => [c.id, c.stale])).toEqual([
        [second.id, true],
        [first.id, true],
      ]);
      const others = (await listChecks(a.token, otherId).expect(200)).body as { checks: CheckBody[] };
      expect(others.checks.map((c) => [c.id, c.stale])).toEqual([[other.id, false]]);
    });

    it('PATCH item answer marks the letter’s existing checks stale', async () => {
      const { id, itemIds } = await generated(a.token);
      await setAnswer(a.token, id, itemIds[0], '저는 분석 동아리에서 리포트 10건을 썼습니다.');
      fake.queue('check-sentences', { sentences: [] }, { sentences: [] });
      await createOk(a.token, id);
      await createOk(a.token, id);

      await setAnswer(a.token, id, itemIds[0], '고친 응답입니다.');

      const list = (await listChecks(a.token, id).expect(200)).body as { checks: CheckBody[] };
      expect(list.checks).toHaveLength(2);
      expect(list.checks.every((c) => c.stale)).toBe(true);
    });

    it('POST item answer (generation) marks the letter’s existing checks stale', async () => {
      const { id, itemIds } = await generated(a.token);
      const now = new Date();
      const exp = await connection.collection('experiences').insertOne({
        userId: new Types.ObjectId(a.userId),
        title: '축제 운영',
        period: '2025',
        itemStatus: { situation: null, role: null, action: null, result: null, meaning: null },
        createdAt: now,
        updatedAt: now,
      });
      await connection.collection('facts').insertOne({
        experienceId: exp.insertedId,
        userId: new Types.ObjectId(a.userId),
        item: 'action',
        text: '부스 동선을 다시 짰다',
        status: 'confirmed',
        source: 'said',
        clueId: null,
        origin: 'manual',
        createdAt: now,
      });
      await http()
        .put(`/api/cover-letters/${id}/items/${itemIds[1]}/experiences`)
        .set(auth(a.token))
        .send({ experienceIds: [String(exp.insertedId)] })
        .expect(200);
      fake.queue('check-sentences', { sentences: [] }, { sentences: [] });
      await createOk(a.token, id);
      await createOk(a.token, id);
      fake.queue('cover-letter-answer', { answer: '생성된 응답' });

      await http().post(`/api/cover-letters/${id}/items/${itemIds[1]}/answer`).set(auth(a.token)).expect(200);

      const list = (await listChecks(a.token, id).expect(200)).body as { checks: CheckBody[] };
      expect(list.checks).toHaveLength(2);
      expect(list.checks.every((c) => c.stale)).toBe(true);
    });

    // 오래된 점검은 볼 수만 있다(학생 답 2026-10-30): start·answers는 AI 없이 409 CHECK_STALE, 조회는 200.
    it('start and answers on a stale check return 409 CHECK_STALE without calling the AI, while GET still works', async () => {
      const { id, check } = await pastedCheck(a.token);
      fake.queue('check-question', { question: 'Q1' });
      await start(a.token, check.id, check.sentences[0].id).expect(200);
      await http().patch(`/api/cover-letters/${id}`).set(auth(a.token)).send({ title: '새 제목' }).expect(200);
      fake.reset();

      expectStale(await start(a.token, check.id, check.sentences[1].id));
      expectStale(await start(a.token, check.id, check.sentences[0].id));
      expectStale(await answers(a.token, check.id, check.sentences[0].id));
      expect(fake.calls).toEqual([]);

      const saved = (await getCheck(a.token, check.id).expect(200)).body as { check: CheckBody };
      expect(saved.check.stale).toBe(true);
      expect(saved.check.sentences[1].status).toBe('pending');
      // 남의 오래된 점검은 409가 아니라 404여야 점검이 있다는 사실이 새지 않는다(R1).
      expectNotFound(await start(b.token, check.id, check.sentences[1].id));
      expectNotFound(await answers(b.token, check.id, check.sentences[0].id));
    });
  });

  // 답 판정(R10·R11)은 상태를 서버가 정해야 AI가 마음대로 「설명됨」을 고르지 못한다(명세 08 ①~④).
  describe('C8-3 POST sentences/:sentenceId/answers', () => {
    const SENTENCE = '저는 축제 운영팀장으로 방문객을 30% 늘렸습니다.';
    const OTHER = '팀원들과 매주 회의를 했습니다.';

    interface TurnBody {
      question: string;
      answer: string | null;
      judge: { id: string; result: string }[];
    }
    type AnswerBody = { sentence: Omit<SentenceBody, 'turns'> & { turns: TurnBody[] }; newCandidates: unknown[] };

    const start = (token: string, checkId: string, sentenceId: string) =>
      http().post(`/api/checks/${checkId}/sentences/${sentenceId}/start`).set(auth(token));
    const answer = (token: string, checkId: string, sentenceId: string, body: unknown) =>
      http()
        .post(`/api/checks/${checkId}/sentences/${sentenceId}/answers`)
        .set(auth(token))
        .send(body as object);

    const MISSING = { unknown: false, judge: [{ id: 'J1', result: 'missing' }, { id: 'J2', result: 'met' }], candidates: [] };

    // 점검 하나를 만들고 첫 문장을 시작해 둔다(첫 질문 Q1, followUpsLeft 3).
    async function started(token: string): Promise<{ check: CheckBody; sentenceId: string }> {
      const id = await pasted(token);
      fake.queue('check-sentences', {
        sentences: [
          { text: SENTENCE, coverLetterItemId: null },
          { text: OTHER, coverLetterItemId: null },
        ],
      });
      const check = await createOk(token, id);
      fake.queue('check-question', { question: 'Q1' });
      await start(token, check.id, check.sentences[0].id).expect(200);
      return { check, sentenceId: check.sentences[0].id };
    }

    // 점수는 어디에도 없어야 한다(R11): 응답 JSON 전체를 훑어 score·points 같은 키가 없음을 확인한다.
    function expectNoScore(value: unknown): void {
      if (Array.isArray(value)) return value.forEach(expectNoScore);
      if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
          expect(key).not.toMatch(/score|point|grade|rating/i);
          expectNoScore(inner);
        }
      }
    }

    // ① 모른다고 답하면 J 판정보다 먼저 unknown으로 끝내야 같은 기준으로 다시 캐묻지 않는다(R11, 학생 답 2026-10-30).
    it('(a) unknown: true with every J missing ends as unknown and records the answer without a new turn', async () => {
      const { check, sentenceId } = await started(a.token);
      fake.queue('check-answer', {
        unknown: true,
        judge: [{ id: 'J1', result: 'missing' }, { id: 'J2', result: 'missing' }],
        nextQuestion: 'q',
        candidates: [],
      });

      const res = await answer(a.token, check.id, sentenceId, { text: '정확히 기억은 안 나요' });

      expect(res.status).toBe(200);
      expect(Object.keys(res.body as object).sort()).toEqual(['newCandidates', 'sentence']);
      const { sentence } = res.body as AnswerBody;
      expect(sentence.status).toBe('unknown');
      expect(sentence.followUpsLeft).toBe(3);
      expect(sentence.turns).toEqual([
        {
          question: 'Q1',
          answer: '정확히 기억은 안 나요',
          judge: [{ id: 'J1', result: 'missing' }, { id: 'J2', result: 'missing' }],
        },
      ]);
      expectNoScore(res.body);
      // 판정 AI에는 문장·질문·답과 J 기준 문장이 함께 가야 기준대로 판정한다.
      const call = fake.calls.find((c) => c.task === 'check-answer');
      expect(call?.user).toContain(SENTENCE);
      expect(call?.user).toContain('Q1');
      expect(call?.user).toContain('정확히 기억은 안 나요');
      expect(call?.system).toContain('계산 방법, 비교 기준(무엇 대비), 기간');

      const saved = (await getCheck(a.token, check.id).expect(200)).body as { check: CheckBody };
      expect(saved.check.sentences[0]).toEqual(sentence);
    });

    // ② 해당 기준이 모두 met이면 설명됨으로 끝난다.
    it('(b) all judge met ends as explained', async () => {
      const { check, sentenceId } = await started(a.token);
      fake.queue('check-answer', {
        unknown: false,
        judge: [{ id: 'J1', result: 'met' }, { id: 'J4', result: 'met' }],
        nextQuestion: null,
        candidates: [],
      });

      const res = await answer(a.token, check.id, sentenceId, { text: '3월 대비 5월 방문객 수로 계산했어요' });

      expect(res.status).toBe(200);
      const { sentence } = res.body as AnswerBody;
      expect(sentence.status).toBe('explained');
      expect(sentence.turns).toHaveLength(1);
      expect(sentence.turns[0].answer).toBe('3월 대비 5월 방문객 수로 계산했어요');
      expect(sentence.followUpsLeft).toBe(3);
      expectNoScore(res.body);
    });

    // ③④ 빠진 기준이 남으면 추가 질문을 3번까지만 하고, 상한에 닿으면 needs_more로 끝나야 끝없이 캐묻지 않는다(R10).
    it('(c) missing three times in a row asks 3 follow-ups then ends as needs_more with 4 turns', async () => {
      const { check, sentenceId } = await started(a.token);

      for (let i = 1; i <= 3; i++) {
        fake.queue('check-answer', { ...MISSING, nextQuestion: `F${i}` });
        const res = await answer(a.token, check.id, sentenceId, { text: `답${i}` });
        expect(res.status).toBe(200);
        const { sentence } = res.body as AnswerBody;
        expect(sentence.status).toBe('in_progress');
        expect(sentence.followUpsLeft).toBe(3 - i);
        expect(sentence.turns).toHaveLength(i + 1);
        expect(sentence.turns[i]).toEqual({ question: `F${i}`, answer: null, judge: [] });
        expect(sentence.turns[i - 1].answer).toBe(`답${i}`);
        expectNoScore(res.body);
      }

      fake.queue('check-answer', { ...MISSING, nextQuestion: 'F4' });
      const last = await answer(a.token, check.id, sentenceId, { text: '답4' });

      expect(last.status).toBe(200);
      const { sentence } = last.body as AnswerBody;
      expect(sentence.status).toBe('needs_more');
      expect(sentence.followUpsLeft).toBe(0);
      expect(sentence.turns.map((t) => t.question)).toEqual(['Q1', 'F1', 'F2', 'F3']);
      expect(sentence.turns.map((t) => t.answer)).toEqual(['답1', '답2', '답3', '답4']);
      expect(sentence.turns.every((t) => t.judge.length > 0)).toBe(true);
    });

    // 시작 전·끝난 문장에 답을 받으면 질문 없는 답이나 끝난 판정을 덮어쓰게 된다: AI 없이 409.
    it('returns 409 SENTENCE_NOT_STARTED before start and 409 SENTENCE_FINISHED after the sentence ends, without calling the AI', async () => {
      const { check, sentenceId } = await started(a.token);
      fake.reset();

      const notStarted = await answer(a.token, check.id, check.sentences[1].id, { text: '답' });
      expect(notStarted.status).toBe(409);
      expect((notStarted.body as ErrorBody).error.code).toBe('SENTENCE_NOT_STARTED');
      expect(fake.calls).toEqual([]);

      fake.queue('check-answer', { unknown: false, judge: [{ id: 'J2', result: 'met' }], nextQuestion: null, candidates: [] });
      await answer(a.token, check.id, sentenceId, { text: '제가 직접 했어요' }).expect(200);
      const callsBefore = fake.calls.length;

      const finished = await answer(a.token, check.id, sentenceId, { text: '또 답' });
      expect(finished.status).toBe(409);
      expect((finished.body as ErrorBody).error.code).toBe('SENTENCE_FINISHED');
      expect(fake.calls).toHaveLength(callsBefore);
    });

    // 빈 답은 판정할 내용이 없다: AI 비용 없이 400.
    it('returns 400 for an empty, blank or missing text without calling the AI', async () => {
      const { check, sentenceId } = await started(a.token);
      fake.reset();

      for (const body of [{ text: '' }, { text: '   ' }, {}, { text: 3 }]) {
        const res = await answer(a.token, check.id, sentenceId, body);
        expect(res.status).toBe(400);
        expect((res.body as ErrorBody).error.code).toBe('VALIDATION');
      }
      expect(fake.calls).toEqual([]);
    });

    // AI가 실패했는데 답이나 turn이 저장되면 판정 없는 기록이 남는다(C2): 502이고 문장·후보는 그대로다.
    it('returns 502 and keeps turns, followUpsLeft, status and candidates when the AI fails, answers off-schema, empty judge, or missing without a next question', async () => {
      const { check, sentenceId } = await started(a.token);
      const before = ((await getCheck(a.token, check.id).expect(200)).body as { check: CheckBody }).check;

      fake.fail('check-answer');
      fake.queue('check-answer', { unknown: 'no', judge: 'x' });
      fake.queue('check-answer', { unknown: false, judge: [], nextQuestion: null, candidates: [] });
      fake.queue('check-answer', { ...MISSING, nextQuestion: null });
      fake.queue('check-answer', { ...MISSING, nextQuestion: '   ' });

      for (let i = 0; i < 5; i++) {
        const res = await answer(a.token, check.id, sentenceId, { text: '답' });
        expect(res.status).toBe(502);
        expect((res.body as ErrorBody).error.code).toBe('AI_UNAVAILABLE');
      }

      const after = ((await getCheck(a.token, check.id).expect(200)).body as { check: CheckBody }).check;
      expect(after.sentences).toEqual(before.sentences);
      expect(after.candidates).toEqual(before.candidates);
    });

    // 남의 점검은 있는지조차 알 수 없어야 한다(R1).
    it('returns 404 for others’ checks and missing or malformed ids without calling the AI', async () => {
      const { check, sentenceId } = await started(a.token);
      fake.reset();

      expectNotFound(await answer(b.token, check.id, sentenceId, { text: '답' }));
      expectNotFound(await answer(a.token, check.id, 'not-an-id', { text: '답' }));
      expectNotFound(await answer(a.token, new Types.ObjectId().toHexString(), sentenceId, { text: '답' }));
      expect(fake.calls).toEqual([]);
    });
  });
});
