import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InterviewEngine } from '../src/engine.js';
import { MongoSessionStore, type InterviewSessionDoc } from '../src/mongoStore.js';
import { ConflictError } from '../src/store.js';
import { COVER_LETTER, FakeLlm, FOUR_QUESTIONS, nextMain, RESUME } from './helpers.js';

// 실제 MongoDB가 있을 때만 돈다. 예: docker run --rm -p 27017:27017 mongo:8
//   MONGO_URL=mongodb://localhost:27017 npm test
const url = process.env.MONGO_URL;

describe.skipIf(!url)('MongoSessionStore (실제 MongoDB)', () => {
  let client: MongoClient;
  let store: MongoSessionStore;

  beforeAll(async () => {
    client = new MongoClient(url!);
    await client.connect();
    const col = client.db(`interview_test_${Date.now()}`).collection<InterviewSessionDoc>('interview_sessions');
    await MongoSessionStore.ensureIndexes(col);
    store = new MongoSessionStore(col);
  });

  afterAll(async () => {
    await client?.db().dropDatabase().catch(() => undefined);
    await client?.close();
  });

  it('시작·답변·종료가 MongoDB에 저장되고 다시 읽힌다', async () => {
    const llm = new FakeLlm({ main_questions: () => FOUR_QUESTIONS, interview_turn: () => nextMain() });
    const engine = new InterviewEngine({ store, llm });
    let v = await engine.start({ userId: 'u1', resume: RESUME, coverLetter: COVER_LETTER });
    v = await engine.answer(v.sessionId, 'u1', { questionId: v.current!.questionId, text: '답' });
    v = await engine.end(v.sessionId, 'u1');
    const saved = await store.get(v.sessionId);
    expect(saved?.answers).toHaveLength(1);
    expect(saved?.status).toBe('ended');
    expect(saved && '_id' in saved).toBe(false);
    const list = await engine.list('u1');
    expect(list[0]?.sessionId).toBe(v.sessionId);
  });

  it('같은 버전으로 두 번 저장하면 두 번째는 ConflictError', async () => {
    const llm = new FakeLlm({ main_questions: () => FOUR_QUESTIONS });
    const engine = new InterviewEngine({ store, llm });
    const v = await engine.start({ userId: 'u2', resume: RESUME, coverLetter: COVER_LETTER });
    const s = (await store.get(v.sessionId))!;
    await store.save({ ...s, version: s.version + 1 }, s.version);
    await expect(store.save({ ...s, version: s.version + 1 }, s.version)).rejects.toBeInstanceOf(ConflictError);
  });
});
