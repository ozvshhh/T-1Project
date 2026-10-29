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
import { ResumeModule } from '../resume/resume.module';
import { createExperienceViaResume } from '../resume/resume.test-helper';
import { UsersModule } from '../users/users.module';
import { ExperiencesModule } from './experiences.module';

interface FactBody {
  id: string;
  item: string;
  text: string;
  status: string;
  source: string;
  clueId: string | null;
  origin: string;
  createdAt: string;
}

interface ExperienceBody {
  id: string;
  itemStatus: Record<string, string | null>;
  card: Record<string, FactBody[]>;
  candidates: FactBody[];
  updatedAt: string;
}

interface ErrorBody {
  error: { code: string; details?: { field: string; reason: string }[] };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ITEMS = ['situation', 'role', 'action', 'result', 'meaning'];
const ALL_NULL = Object.fromEntries(ITEMS.map((item) => [item, null]));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 직접 쓴 사실(api.md 6절 POST/PATCH/DELETE .../facts). 카드는 자소서 근거가 되므로 확인되지 않은 출처·남의 단서가 섞이면 안 된다(C1·R1).
describe('Experience facts (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let connection: Connection;

  const http = () => request(app.getHttpServer() as Server);

  async function signup(email: string): Promise<string> {
    const res = await http().post('/api/auth/signup').send({ email, password: 'pass-1234' }).expect(201);
    return (res.body as { token: string }).token;
  }

  // 경험은 이력서 초안 확정으로만 만든다(명세 10).
  async function createExperience(token: string): Promise<ExperienceBody> {
    return createExperienceViaResume<ExperienceBody>(app, token, { title: '동아리 축제', period: '2025년 여름' });
  }

  async function getExperience(token: string, id: string): Promise<ExperienceBody> {
    const res = await http().get(`/api/experiences/${id}`).set('Authorization', `Bearer ${token}`).expect(200);
    return (res.body as { experience: ExperienceBody }).experience;
  }

  async function addTextClue(token: string, expId: string): Promise<string> {
    const res = await http()
      .post(`/api/experiences/${expId}/clues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'text', text: '회의록: 로그 분석 스크립트 작성' })
      .expect(201);
    return (res.body as { clue: { id: string } }).clue.id;
  }

  function postFact(token: string, expId: string, body: unknown) {
    return http().post(`/api/experiences/${expId}/facts`).set('Authorization', `Bearer ${token}`).send(body as object);
  }

  function patchFact(token: string, expId: string, factId: string, body: unknown) {
    return http()
      .patch(`/api/experiences/${expId}/facts/${factId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);
  }

  function deleteFact(token: string, expId: string, factId: string) {
    return http().delete(`/api/experiences/${expId}/facts/${factId}`).set('Authorization', `Bearer ${token}`);
  }

  async function createFact(token: string, expId: string): Promise<FactBody> {
    const res = await postFact(token, expId, { item: 'action', text: '로그 분석 자동화', source: 'said' }).expect(201);
    return (res.body as { fact: FactBody }).fact;
  }

  function cardIds(exp: ExperienceBody): string[] {
    return ITEMS.flatMap((item) => exp.card[item].map((f) => f.id));
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
        ExperiencesModule,
        ResumeModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api', { exclude: ['__health'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    await connection.model('User').syncIndexes();
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  // 사용자가 직접 쓴 것은 바로 확정·manual이고 카드의 그 항목에 들어가야 자소서 근거로 쓰인다(R6).
  it('POST said fact → 201 confirmed/manual and appears in card[item], not candidates', async () => {
    const token = await signup('fact-post@example.com');
    const exp = await createExperience(token);
    const res = await postFact(token, exp.id, { item: 'action', text: '  로그 분석 자동화  ', source: 'said' }).expect(
      201,
    );
    const fact = (res.body as { fact: FactBody }).fact;
    expect(Object.keys(fact).sort()).toEqual(
      ['clueId', 'createdAt', 'id', 'item', 'origin', 'source', 'status', 'text'].sort(),
    );
    expect(fact).toMatchObject({
      item: 'action',
      text: '로그 분석 자동화',
      status: 'confirmed',
      source: 'said',
      clueId: null,
      origin: 'manual',
    });
    expect(fact.createdAt).toMatch(ISO);

    const after = await getExperience(token, exp.id);
    expect(after.card.action.map((f) => f.id)).toEqual([fact.id]);
    expect(after.candidates).toEqual([]);
    for (const item of ITEMS.filter((i) => i !== 'action')) expect(after.card[item]).toEqual([]);
  });

  // 자료로 확인한 사실은 어느 단서인지 남아야 R5(출처 보기)가 그 단서를 열 수 있다.
  it('POST clue fact with a clue of this experience → 201 with clueId', async () => {
    const token = await signup('fact-clue@example.com');
    const exp = await createExperience(token);
    const clueId = await addTextClue(token, exp.id);
    const res = await postFact(token, exp.id, {
      item: 'result',
      text: '처리 시간 30% 단축',
      source: 'clue',
      clueId,
    }).expect(201);
    expect((res.body as { fact: FactBody }).fact).toMatchObject({ source: 'clue', clueId, status: 'confirmed' });
    const after = await getExperience(token, exp.id);
    expect(after.card.result[0].clueId).toBe(clueId);
  });

  // 확인 안 된 출처·없는 항목·빈 문장·출처 없는 clue·남의 경험 단서는 카드에 들어가면 안 된다(C1). 400 뒤 아무것도 저장되지 않아야 한다.
  it('POST rejects invalid input with 400 VALIDATION and saves nothing', async () => {
    const token = await signup('fact-invalid@example.com');
    const exp = await createExperience(token);
    const other = await createExperience(token);
    const otherClueId = await addTextClue(token, other.id);

    const cases: [unknown, string][] = [
      [{ item: 'action', text: '사실', source: 'ai_unverified' }, 'source'],
      [{ item: 'xxx', text: '사실', source: 'said' }, 'item'],
      [{ item: 'action', text: '   ', source: 'said' }, 'text'],
      [{ item: 'action', text: '사실', source: 'clue' }, 'clueId'],
      [{ item: 'action', text: '사실', source: 'clue', clueId: otherClueId }, 'clueId'],
      [{ item: 'action', text: '사실', source: 'clue', clueId: 'not-an-id' }, 'clueId'],
    ];
    for (const [body, field] of cases) {
      const res = await postFact(token, exp.id, body).expect(400);
      const err = (res.body as ErrorBody).error;
      expect(err.code).toBe('VALIDATION');
      expect(err.details?.map((d) => d.field)).toContain(field);
    }
    const after = await getExperience(token, exp.id);
    expect(cardIds(after)).toEqual([]);
    expect(after.candidates).toEqual([]);
  });

  // 카드에서 고친 내용이 그대로 반영돼야 한다(R6): 항목을 옮기면 이전 칸에서 빠지고 새 칸에 들어간다.
  it('PATCH updates text, item and source → 200 {fact}, moved to the new card item', async () => {
    const token = await signup('fact-patch@example.com');
    const exp = await createExperience(token);
    const clueId = await addTextClue(token, exp.id);
    const fact = await createFact(token, exp.id);

    const res = await patchFact(token, exp.id, fact.id, {
      text: '  로그 분석으로 장애 원인 파악  ',
      item: 'result',
      source: 'clue',
      clueId,
    }).expect(200);
    expect((res.body as { fact: FactBody }).fact).toMatchObject({
      id: fact.id,
      item: 'result',
      text: '로그 분석으로 장애 원인 파악',
      source: 'clue',
      clueId,
      status: 'confirmed',
      origin: 'manual',
    });
    let after = await getExperience(token, exp.id);
    expect(after.card.action).toEqual([]);
    expect(after.card.result.map((f) => f.id)).toEqual([fact.id]);

    // said로 되돌리면 단서 연결이 끊겨야 한다: 남은 clueId가 "자료로 확인"처럼 보이면 안 된다.
    const back = await patchFact(token, exp.id, fact.id, { source: 'said' }).expect(200);
    expect((back.body as { fact: FactBody }).fact).toMatchObject({ source: 'said', clueId: null });
    after = await getExperience(token, exp.id);
    expect(after.card.result[0]).toMatchObject({ source: 'said', clueId: null });
  });

  // PATCH도 POST와 같은 규칙: 고치는 길로 확인 안 된 출처나 남의 단서를 넣을 수 없어야 한다(C1).
  it('PATCH rejects invalid input with 400 VALIDATION and leaves the fact unchanged', async () => {
    const token = await signup('fact-patch-invalid@example.com');
    const exp = await createExperience(token);
    const other = await createExperience(token);
    const otherClueId = await addTextClue(token, other.id);
    const fact = await createFact(token, exp.id);

    const cases: [unknown, string][] = [
      [{ source: 'ai_unverified' }, 'source'],
      [{ item: 'xxx' }, 'item'],
      [{ text: '   ' }, 'text'],
      [{ source: 'clue' }, 'clueId'],
      [{ source: 'clue', clueId: otherClueId }, 'clueId'],
    ];
    for (const [body, field] of cases) {
      const res = await patchFact(token, exp.id, fact.id, body).expect(400);
      const err = (res.body as ErrorBody).error;
      expect(err.code).toBe('VALIDATION');
      expect(err.details?.map((d) => d.field)).toContain(field);
    }
    const after = await getExperience(token, exp.id);
    expect(after.card.action).toEqual([fact]);
  });

  // 지운 사실은 카드에서 사라져야 하고, 다시 지우거나 고치려 하면 없는 자원(404)이다.
  it('DELETE → 204 with empty body, removed from card; repeat DELETE/PATCH → 404', async () => {
    const token = await signup('fact-delete@example.com');
    const exp = await createExperience(token);
    const fact = await createFact(token, exp.id);

    const res = await deleteFact(token, exp.id, fact.id).expect(204);
    expect(res.text).toBe('');
    const after = await getExperience(token, exp.id);
    expect(cardIds(after)).toEqual([]);

    await deleteFact(token, exp.id, fact.id).expect(404);
    await patchFact(token, exp.id, fact.id, { text: '다시' }).expect(404);
  });

  // itemStatus는 대화가 정하는 값이라 사실 편집으로 바뀌면 안 되고(api.md 5절 끝), updatedAt은 올라야 목록이 최근 수정순이다(R6).
  it('POST/PATCH/DELETE keep itemStatus and bump updatedAt', async () => {
    const token = await signup('fact-status@example.com');
    const exp = await createExperience(token);

    await sleep(15);
    const fact = await createFact(token, exp.id);
    const afterPost = await getExperience(token, exp.id);
    expect(afterPost.itemStatus).toEqual(ALL_NULL);
    expect(Date.parse(afterPost.updatedAt)).toBeGreaterThan(Date.parse(exp.updatedAt));

    await sleep(15);
    await patchFact(token, exp.id, fact.id, { text: '고친 문장' }).expect(200);
    const afterPatch = await getExperience(token, exp.id);
    expect(afterPatch.itemStatus).toEqual(ALL_NULL);
    expect(Date.parse(afterPatch.updatedAt)).toBeGreaterThan(Date.parse(afterPost.updatedAt));

    await sleep(15);
    await deleteFact(token, exp.id, fact.id).expect(204);
    const afterDelete = await getExperience(token, exp.id);
    expect(afterDelete.itemStatus).toEqual(ALL_NULL);
    expect(Date.parse(afterDelete.updatedAt)).toBeGreaterThan(Date.parse(afterPatch.updatedAt));
  });

  // 남의 경험·다른 경험의 사실·잘못된 id는 모두 404라 존재 여부가 새지 않는다(R1).
  it('owner checks: other user, fact of another experience, malformed ids → 404', async () => {
    const owner = await signup('fact-owner@example.com');
    const stranger = await signup('fact-stranger@example.com');
    const exp = await createExperience(owner);
    const second = await createExperience(owner);
    const fact = await createFact(owner, exp.id);
    const valid = { item: 'action', text: '남의 카드', source: 'said' };

    await postFact(stranger, exp.id, valid).expect(404);
    await patchFact(stranger, exp.id, fact.id, { text: '남이 고침' }).expect(404);
    await deleteFact(stranger, exp.id, fact.id).expect(404);

    await patchFact(owner, second.id, fact.id, { text: '다른 경로' }).expect(404);
    await deleteFact(owner, second.id, fact.id).expect(404);

    await postFact(owner, 'not-an-id', valid).expect(404);
    await patchFact(owner, exp.id, 'not-an-id', { text: 'x' }).expect(404);
    await deleteFact(owner, exp.id, 'not-an-id').expect(404);

    const after = await getExperience(owner, exp.id);
    expect(after.card.action).toEqual([fact]);
  });
});
