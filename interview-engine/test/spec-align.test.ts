// docs/problem.yaml F5·F8, docs/scenarios.yaml S5·S6, README 구현 설계에 맞춘 기능 검사
import { describe, expect, it } from 'vitest';
import { InterviewEngine, type SeedFinishedInput } from '../src/engine.js';
import { MemorySessionStore } from '../src/store.js';
import { mongoDbNameFromEnv, mongoUrlFromEnv } from '../nest/interview.module.js';
import { clock, COVER_LETTER, FakeCoverLetters, FakeLlm, FOUR_QUESTIONS, nextMain, RESUME } from './helpers.js';

function setup() {
  const store = new MemorySessionStore();
  const letters = new FakeCoverLetters();
  letters.resumes.set('u1', RESUME);
  letters.letters.set('cl-1', { userId: 'u1', body: COVER_LETTER });
  letters.letters.set('cl-other', { userId: 'u2', body: '남의 자기소개서' });
  const c = clock();
  let n = 0;
  const engine = new InterviewEngine({
    store,
    llm: new FakeLlm({
      main_questions: () => FOUR_QUESTIONS,
      interview_turn: () => nextMain(),
      cover_letter_suggestions: () => ({
        suggestions: [
          {
            original: '팀 프로젝트에서 로그인 기능을 맡아 응답 속도를 개선했습니다.',
            revised: '팀 프로젝트에서 로그인 API를 직접 구현했습니다.',
            reason: '면접에서 담당 범위를 로그인 API로 설명함',
            answer_id: 'A1',
          },
        ],
      }),
    }),
    coverLetters: letters,
    now: c.now,
    newId: () => `S${++n}`,
  });
  return { engine, store, letters, clock: c };
}

const SEED: SeedFinishedInput = {
  id: 'seed-interview-1',
  userId: 'u1',
  resume: RESUME,
  coverLetter: COVER_LETTER,
  coverLetterId: 'cl-1',
  qa: [
    {
      interviewer: 'practical',
      purpose: '본인 기여',
      fields: ['contribution', 'process'],
      question: '로그인 기능에서 직접 맡은 부분은 무엇인가요?',
      answer: '로그인 API를 직접 구현했어요.',
      explained: ['contribution'],
    },
  ],
  suggestions: [
    {
      original: '팀 프로젝트에서 로그인 기능을 맡아 응답 속도를 개선했습니다.',
      revised: '팀 프로젝트에서 로그인 API를 직접 구현했습니다.',
      reason: '면접에서 담당 범위를 로그인 API로 설명함',
      answerIndex: 0,
    },
  ],
};

describe('자기소개서 id로 시작 (F5)', () => {
  it('저장소에서 이력서·자기소개서를 읽어 시작하고 id를 기록한다', async () => {
    const { engine, store } = setup();
    const v = await engine.start({ userId: 'u1', coverLetterId: 'cl-1' });
    const s = (await store.get(v.sessionId))!;
    expect(s.coverLetterId).toBe('cl-1');
    expect(s.coverLetter).toBe(COVER_LETTER);
    expect(s.resume).toBe(RESUME);
  });

  it('없는 자기소개서나 남의 자기소개서면 not_found', async () => {
    const { engine } = setup();
    await expect(engine.start({ userId: 'u1', coverLetterId: 'nope' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(engine.start({ userId: 'u1', coverLetterId: 'cl-other' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('저장소가 연결되지 않았는데 id로 시작하면 invalid_input', async () => {
    const engine = new InterviewEngine({ store: new MemorySessionStore(), llm: null });
    await expect(engine.start({ userId: 'u1', coverLetterId: 'cl-1' })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('면접 중 기록과 종료 사유 이름 (F6·S5)', () => {
  it('답할 때마다 기록에 한 줄씩 쌓이고, 종료하면 사유가 "사용자 종료"', async () => {
    const { engine } = setup();
    let v = await engine.start({ userId: 'u1', coverLetterId: 'cl-1' });
    expect(v.history).toHaveLength(1);
    expect(v.history[0]!.answer).toBeNull();
    v = await engine.answer(v.sessionId, 'u1', { questionId: v.current!.questionId, text: '세션 만료 처리를 고쳤습니다.' });
    expect(v.history).toHaveLength(2);
    expect(v.history[0]!.answer).toBe('세션 만료 처리를 고쳤습니다.');
    expect(v.history[0]!.interviewerLabel).toMatch(/면접관/);
    v = await engine.end(v.sessionId, 'u1');
    expect(v.endReasonLabel).toBe('사용자 종료');
    const r = await engine.result(v.sessionId, 'u1');
    expect(r.endReasonLabel).toBe('사용자 종료');
  });
});

describe('면접 기록 목록 (F8·S6)', () => {
  it('내 면접만 최근 것부터 보여 준다', async () => {
    const { engine, clock: c } = setup();
    const first = await engine.start({ userId: 'u1', coverLetterId: 'cl-1' });
    await engine.end(first.sessionId, 'u1');
    c.advance(60_000);
    const second = await engine.start({ userId: 'u1', resume: RESUME, coverLetter: '다른 자기소개서' });
    await engine.start({ userId: 'u2', resume: RESUME, coverLetter: '남의 것' });

    const list = await engine.list('u1');
    expect(list.map((x) => x.sessionId)).toEqual([second.sessionId, first.sessionId]);
    expect(list[1]).toMatchObject({ status: 'ended', endReasonLabel: '사용자 종료', coverLetterId: 'cl-1' });
    expect(list[0]!.coverLetterPreview).toBe('다른 자기소개서');
  });
});

describe('수정 제안 승인 → 자기소개서 저장 (F8·S6)', () => {
  it('자기소개서 id로 시작한 면접에서 승인하면 저장소의 자기소개서가 바뀐다', async () => {
    const { engine, letters } = setup();
    let v = await engine.start({ userId: 'u1', coverLetterId: 'cl-1' });
    v = await engine.answer(v.sessionId, 'u1', { questionId: v.current!.questionId, text: '로그인 API만 직접 만들었어요' });
    await engine.end(v.sessionId, 'u1');
    const r = await engine.result(v.sessionId, 'u1');
    const applied = await engine.approveSuggestion(v.sessionId, 'u1', r.suggestions[0]!.id);
    expect(applied.saved).toBe(true);
    expect(letters.letters.get('cl-1')!.body).toContain('로그인 API를 직접 구현했습니다.');
    expect(letters.letters.get('cl-1')!.body).not.toContain('응답 속도를 개선했습니다.');
  });

  it('면접 뒤에 사용자가 그 문장을 고쳤으면 적용하지 않고 stale로 둔다', async () => {
    const { engine, letters, store } = setup();
    await engine.seedFinished(SEED);
    letters.letters.get('cl-1')!.body = '완전히 새로 쓴 자기소개서';
    await expect(engine.approveSuggestion(SEED.id, 'u1', 'S1')).rejects.toMatchObject({ code: 'conflict' });
    expect(letters.letters.get('cl-1')!.body).toBe('완전히 새로 쓴 자기소개서');
    expect((await store.get(SEED.id))!.suggestions![0]!.status).toBe('stale');
  });
});

describe('시드 끝난 면접 (S6)', () => {
  it('한 번만 만들어지고, 목록·결과에 보이며, 승인하면 자기소개서가 바뀐다', async () => {
    const { engine, letters } = setup();
    expect(await engine.seedFinished(SEED)).toBe(true);
    expect(await engine.seedFinished(SEED)).toBe(false);

    const list = await engine.list('u1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ sessionId: SEED.id, status: 'ended', pendingSuggestions: 1 });

    const r = await engine.result(SEED.id, 'u1');
    expect(r.log).toHaveLength(1);
    expect(r.explained.map((f) => f.field)).toEqual(['contribution']);
    expect(r.suggestions[0]).toMatchObject({ id: 'S1', status: 'pending' });

    await engine.approveSuggestion(SEED.id, 'u1', 'S1');
    expect(letters.letters.get('cl-1')!.body).toContain('로그인 API를 직접 구현했습니다.');
    expect((await engine.list('u1'))[0]!.pendingSuggestions).toBe(0);
  });

  it('원래 문장이 자기소개서에 없으면 시드를 거절한다', async () => {
    const { engine } = setup();
    await expect(
      engine.seedFinished({ ...SEED, id: 'bad', suggestions: [{ ...SEED.suggestions![0]!, original: '없는 문장' }] }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('DB 주소 환경변수 (README 구현 설계)', () => {
  it('DATABASE_URL을 먼저, 없으면 MONGO_URL', () => {
    expect(mongoUrlFromEnv({ DATABASE_URL: 'mongodb://db:27017/app', MONGO_URL: 'mongodb://x' })).toBe('mongodb://db:27017/app');
    expect(mongoUrlFromEnv({ MONGO_URL: 'mongodb://x' })).toBe('mongodb://x');
    expect(mongoUrlFromEnv({})).toBeUndefined();
  });
  it('DB 이름은 MONGO_DB → 주소의 DB 이름 → app', () => {
    expect(mongoDbNameFromEnv({ MONGO_DB: 'x', DATABASE_URL: 'mongodb://db:27017/y' })).toBe('x');
    expect(mongoDbNameFromEnv({ DATABASE_URL: 'mongodb://db:27017/interview?authSource=admin' })).toBe('interview');
    expect(mongoDbNameFromEnv({ DATABASE_URL: 'mongodb+srv://u:p@cluster0.example.net/' })).toBe('app');
    expect(mongoDbNameFromEnv({})).toBe('app');
  });
});
