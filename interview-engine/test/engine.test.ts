import { describe, expect, it } from 'vitest';
import { InterviewEngine, InterviewError } from '../src/engine.js';
import { LlmError } from '../src/llm.js';
import { MemorySessionStore } from '../src/store.js';
import type { TurnOutput } from '../src/schemas.js';
import { clock, COVER_LETTER, FakeLlm, FOUR_QUESTIONS, nextMain, RESUME, seeded } from './helpers.js';

const USER = 'user-1';

function setup(turn: (call: number, user: string) => TurnOutput = () => nextMain(), extra: Partial<ConstructorParameters<typeof FakeLlm>[0]> = {}) {
  const store = new MemorySessionStore();
  const c = clock();
  const llm = new FakeLlm({
    main_questions: () => FOUR_QUESTIONS,
    interview_turn: (req, call) => turn(call, req.user),
    ...extra,
  });
  let n = 0;
  const engine = new InterviewEngine({ store, llm, now: c.now, random: seeded(), newId: () => `S${++n}` });
  return { engine, store, llm, clock: c };
}

const followUp = (field: TurnOutput['target_field'], basis: string, q = '그 부분을 더 설명해 주세요.'): TurnOutput => ({
  check_updates: field ? [{ field, status: 'needs_more' }] : [],
  decision: 'follow_up',
  target_field: field,
  basis_answer_id: basis,
  conflicting_answer_id: null,
  reason: '아직 설명되지 않음',
  question: q,
});

/** 엔진이 보낸 판단 요청에서 현재 주제의 첫 항목과 직전 답변 id를 읽어 꼬리질문을 만든다 */
function followUpFromPrompt(user: string): TurnOutput {
  const field = /^- (\w+)\(/m.exec(user)?.[1] as TurnOutput['target_field'];
  const answerId = /직전 답변 id: (A\d+)/.exec(user)?.[1] ?? 'A0';
  return followUp(field, answerId);
}

describe('면접 시작', () => {
  it('본질문 4개를 실무 2·임원 2로 만들고 순서를 섞어 저장한다', async () => {
    const { engine, store } = setup();
    const view = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    const s = (await store.get(view.sessionId))!;
    expect(s.mainQuestions).toHaveLength(4);
    expect(s.mainQuestions.filter((m) => m.interviewer === 'practical')).toHaveLength(2);
    expect(s.mainQuestions.filter((m) => m.interviewer === 'executive')).toHaveLength(2);
    const order = s.mainQuestions.map((m) => m.text);
    expect(order).not.toEqual(FOUR_QUESTIONS.questions.map((q) => q.question));
    expect(view.current?.text).toBe(s.mainQuestions[0]!.text);
    expect(view.questionCount).toBe(1);
    expect(view.usedFallback).toBe(false);
  });

  it('새로고침해도 순서가 같다', async () => {
    const { engine } = setup();
    const v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    const again = await engine.get(v.sessionId, USER);
    expect(again.current).toEqual(v.current);
  });

  it('근거 문장은 자소서에 실제로 있을 때만 남긴다', async () => {
    const { engine, store } = setup();
    const v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    const s = (await store.get(v.sessionId))!;
    const byText = (t: string) => s.mainQuestions.find((m) => m.text === t)!;
    expect(byText('로그인 기능에서 직접 구현한 부분은 무엇인가요?').basisSentence).toContain('로그인 기능');
    expect(byText('응답 속도 개선은 어떻게 확인했나요?').basisSentence).toBeNull();
  });

  it('AI가 실패하면 기본 질문으로 채우고 그 사실을 기록한다', async () => {
    const { engine, store } = setup(undefined, {
      main_questions: () => {
        throw new LlmError('timeout');
      },
    });
    const v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    const s = (await store.get(v.sessionId))!;
    expect(s.mainQuestions.every((m) => m.fallback)).toBe(true);
    expect(s.fallbackEvents[0]).toMatchObject({ stage: 'questions', reason: 'timeout' });
    expect(v.usedFallback).toBe(true);
    expect(v.current?.fallback).toBe(true);
  });

  it('AI가 한쪽 면접관 질문을 덜 만들면 모자란 만큼만 기본 질문으로 채운다', async () => {
    const { engine, store } = setup(undefined, {
      main_questions: () => ({
        questions: [
          ...FOUR_QUESTIONS.questions.slice(0, 2),
          { ...FOUR_QUESTIONS.questions[0]!, question: '실무 질문 하나 더' },
          FOUR_QUESTIONS.questions[2]!,
          // 임원 질문에 실무 항목만 있으면 버린다
          { ...FOUR_QUESTIONS.questions[3]!, fields: ['contribution'] },
        ],
      }),
    });
    const v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    const s = (await store.get(v.sessionId))!;
    expect(s.mainQuestions.filter((m) => m.interviewer === 'practical' && !m.fallback)).toHaveLength(2);
    expect(s.mainQuestions.filter((m) => m.interviewer === 'executive' && m.fallback)).toHaveLength(1);
    expect(s.fallbackEvents[0]?.reason).toBe('incomplete');
  });

  it('AI 없이도(키 없음) 시작할 수 있다', async () => {
    const engine = new InterviewEngine({ store: new MemorySessionStore(), llm: null });
    const v = await engine.start({ userId: USER, resume: RESUME, coverLetter: '' });
    expect(v.current?.text).toBeTruthy();
    expect(v.usedFallback).toBe(true);
  });

  it('이력서와 자소서가 모두 비면 거절한다', async () => {
    const { engine } = setup();
    await expect(engine.start({ userId: USER, resume: ' ', coverLetter: '' })).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });
});

describe('꼬리질문', () => {
  it('꼬리질문은 같은 면접관이 맡고, 본질문당 최대 2개다', async () => {
    const { engine } = setup((_, user) => followUpFromPrompt(user));
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    const firstInterviewer = v.current!.interviewer;

    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '답1' });
    expect(v.current!.kind).toBe('follow_up');
    expect(v.current!.interviewer).toBe(firstInterviewer);
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '답2' });
    expect(v.current!.kind).toBe('follow_up');
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '답3' });
    expect(v.current!.kind).toBe('main');
    expect(v.questionCount).toBe(4);
  });

  it('항목이 없는 follow_up은 규칙 위반이라 다음 본질문으로 간다', async () => {
    const { engine } = setup((call) => followUp(null, `A${call + 1}`));
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '답' });
    expect(v.current!.kind).toBe('main');
  });

  it('없는 답변 id를 근거로 들면 꼬리질문을 버리고 다음 본질문으로 간다', async () => {
    const { engine } = setup(() => followUp('contribution', 'A99'));
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '답' });
    expect(v.current!.kind).toBe('main');
  });

  it('이미 설명된 항목은 다시 묻지 않는다', async () => {
    let field = 'contribution' as TurnOutput['target_field'];
    const { engine, store } = setup((call) => ({
      ...followUp(field, `A${call + 1}`),
      check_updates: [{ field: field!, status: 'explained' }],
    }));
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    field = (await store.get(v.sessionId))!.mainQuestions[0]!.fields[0]!;
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '제가 직접 구현했습니다' });
    expect(v.current!.kind).toBe('main');
  });

  it('모른다고 한 항목은 한 번만 바꿔 묻는다', async () => {
    let field = 'contribution' as TurnOutput['target_field'];
    const { engine, store } = setup((call) => ({
      ...followUp(field, `A${call + 1}`, '쉽게 바꿔 여쭤볼게요.'),
      check_updates: [{ field: field!, status: 'unknown' }],
    }));
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    field = (await store.get(v.sessionId))!.mainQuestions[0]!.fields[0]!;
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '잘 모르겠어요' });
    expect(v.current!.kind).toBe('follow_up');
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '기억이 안 나요' });
    expect(v.current!.kind).toBe('main');
  });

  it('이전 답변과 다르면 두 답변 id가 모두 있을 때만 다시 확인한다', async () => {
    const { engine } = setup((call) =>
      call === 0
        ? nextMain()
        : {
            ...nextMain(),
            decision: 'clarify',
            basis_answer_id: 'A2',
            conflicting_answer_id: 'A1',
            question: '앞에서는 팀 전체라고 하셨는데, 지금은 로그인만 맡았다고 하셨어요. 어느 쪽이 맞나요?',
          },
    );
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '팀 전체 기능을 만들었어요' });
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '로그인만 맡았어요' });
    expect(v.current!.kind).toBe('clarify');
  });

  it('판단 AI가 실패해도 다음 본질문으로 계속 진행한다', async () => {
    const { engine, store } = setup(() => {
      throw new LlmError('budget');
    });
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '답' });
    expect(v.current!.kind).toBe('main');
    const s = (await store.get(v.sessionId))!;
    expect(s.answers).toHaveLength(1);
    expect(s.fallbackEvents.at(-1)).toMatchObject({ stage: 'turn', reason: 'budget' });
  });
});

describe('종료', () => {
  it('본질문 4개를 다 하면 completed로 끝난다', async () => {
    const { engine } = setup();
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    for (let i = 0; i < 4; i++) {
      v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: `답${i}` });
    }
    expect(v.status).toBe('ended');
    expect(v.endReason).toBe('completed');
    expect(v.current).toBeNull();
  });

  it('매번 꼬리질문을 요구해도 전체 질문은 12개에서 끝난다', async () => {
    const { engine } = setup((_, user) => followUpFromPrompt(user));
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    let guard = 0;
    while (v.status === 'in_progress' && guard++ < 30) {
      v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '답' });
    }
    expect(v.status).toBe('ended');
    expect(v.questionCount).toBe(12);
    expect(v.endReason).toBe('question_limit');
  });

  it('12분이 지나면 현재 답변을 저장한 뒤 끝낸다', async () => {
    const { engine, store, clock: c } = setup();
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    c.advance(12 * 60 * 1000 + 1);
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '마지막 답' });
    expect(v.endReason).toBe('time_limit');
    expect((await store.get(v.sessionId))!.answers.at(-1)?.text).toBe('마지막 답');
  });

  it('건너뛰기는 다음 본질문으로, 종료는 user_ended로 끝낸다', async () => {
    const { engine } = setup();
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    const first = v.current!.text;
    v = await engine.skip(v.sessionId, USER);
    expect(v.current!.text).not.toBe(first);
    expect(v.current!.kind).toBe('main');
    v = await engine.end(v.sessionId, USER);
    expect(v.endReason).toBe('user_ended');
    await expect(
      engine.answer(v.sessionId, USER, { questionId: 'Q2', text: '늦은 답' }),
    ).rejects.toMatchObject({ code: 'ended' });
  });
});

describe('입력·권한 검사', () => {
  it('이미 넘어간 질문에 답하면 conflict', async () => {
    const { engine } = setup();
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    const q = v.current!.questionId;
    v = await engine.answer(v.sessionId, USER, { questionId: q, text: '답' });
    await expect(engine.answer(v.sessionId, USER, { questionId: q, text: '두 번 누름' })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('다른 사용자의 면접은 찾을 수 없다', async () => {
    const { engine } = setup();
    const v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    await expect(engine.get(v.sessionId, 'someone-else')).rejects.toBeInstanceOf(InterviewError);
    await expect(engine.get(v.sessionId, 'someone-else')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('빈 답변과 너무 긴 답변은 거절한다', async () => {
    const { engine } = setup();
    const v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    const q = v.current!.questionId;
    await expect(engine.answer(v.sessionId, USER, { questionId: q, text: '  ' })).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(engine.answer(v.sessionId, USER, { questionId: q, text: 'a'.repeat(4001) })).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });
});

describe('결과', () => {
  async function finished(suggestions: () => unknown) {
    let field = 'contribution' as TurnOutput['target_field'];
    const { engine, store } = setup(
      (call) =>
        call === 0
          ? { ...nextMain(), check_updates: [{ field: field!, status: 'explained' }] }
          : { ...nextMain(), check_updates: [] },
      { cover_letter_suggestions: suggestions as never },
    );
    let v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    field = (await store.get(v.sessionId))!.mainQuestions[0]!.fields[0]!;
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '로그인 API만 직접 만들었어요' });
    v = await engine.answer(v.sessionId, USER, { questionId: v.current!.questionId, text: '두 번째 답' });
    v = await engine.end(v.sessionId, USER);
    return { engine, store, sessionId: v.sessionId };
  }

  it('끝나기 전에는 결과를 주지 않는다', async () => {
    const { engine } = setup();
    const v = await engine.start({ userId: USER, resume: RESUME, coverLetter: COVER_LETTER });
    await expect(engine.result(v.sessionId, USER)).rejects.toMatchObject({ code: 'not_ended' });
  });

  it('기록·설명된 항목·보완할 항목(최대 3개)을 준다', async () => {
    const { engine, sessionId } = await finished(() => ({ suggestions: [] }));
    const r = await engine.result(sessionId, USER);
    expect(r.endReason).toBe('user_ended');
    // 답한 질문 2개 + 종료할 때 떠 있던(답하지 않은) 질문 1개
    expect(r.log).toHaveLength(3);
    expect(r.log[0]!.answer?.text).toBe('로그인 API만 직접 만들었어요');
    expect(r.log[2]!.answer).toBeNull();
    expect(r.log[0]!.interviewerLabel).toMatch(/면접관/);
    expect(r.explained).toHaveLength(1);
    expect(r.toImprove.length).toBeGreaterThan(0);
    expect(r.toImprove.length).toBeLessThanOrEqual(3);
    expect(r.toImprove.every((f) => f.status !== 'explained')).toBe(true);
  });

  it('자소서에 없는 문장·없는 답변을 근거로 한 수정 제안은 버리고, 승인하면 자소서를 고친다', async () => {
    const { engine, sessionId } = await finished(() => ({
      suggestions: [
        {
          original: '팀 프로젝트에서 로그인 기능을 맡아 응답 속도를 개선했습니다.',
          revised: '팀 프로젝트에서 로그인 API를 직접 구현했습니다.',
          reason: '면접에서 담당 범위를 로그인 API로 설명함',
          answer_id: 'A1',
        },
        { original: '자소서에 없는 문장', revised: '바꾼 문장', reason: 'x', answer_id: 'A1' },
        {
          original: '팀원과 일정이 맞지 않아 회의 방식을 바꿨습니다.',
          revised: '바꾼 문장',
          reason: 'x',
          answer_id: 'A99',
        },
      ],
    }));
    const r = await engine.result(sessionId, USER);
    expect(r.suggestions).toHaveLength(1);
    const applied = await engine.approveSuggestion(sessionId, USER, r.suggestions[0]!.id);
    expect(applied.coverLetter).toContain('로그인 API를 직접 구현했습니다.');
    expect(applied.coverLetter).not.toContain('응답 속도를 개선했습니다.');
    await expect(engine.approveSuggestion(sessionId, USER, r.suggestions[0]!.id)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('수정 제안 AI가 실패하면 나머지 결과는 주고, 다시 부르면 재시도한다', async () => {
    let fail = true;
    const { engine, sessionId } = await finished(() => {
      if (fail) throw new LlmError('rate_limit');
      return { suggestions: [] };
    });
    const r1 = await engine.result(sessionId, USER);
    expect(r1.suggestionsError).toBe('rate_limit');
    expect(r1.log.length).toBeGreaterThan(0);
    fail = false;
    const r2 = await engine.result(sessionId, USER);
    expect(r2.suggestionsError).toBeNull();
  });
});
