import { randomUUID } from 'node:crypto';
import {
  DEFAULT_LIMITS,
  FIELD_LABEL,
  INTERVIEWER_FIELDS,
  INTERVIEWER_LABEL,
  INTERVIEWERS,
  type Limits,
} from './config.js';
import { FALLBACK_QUESTIONS } from './fallback.js';
import { LlmError, type LlmClient } from './llm.js';
import { mainQuestionsPrompt, suggestionsPrompt, turnPrompt } from './prompts.js';
import {
  MainQuestionsSchema,
  SuggestionsSchema,
  TurnSchema,
  type MainQuestionsOutput,
  type TurnOutput,
} from './schemas.js';
import { ConflictError, type SessionStore } from './store.js';
import type {
  Answer,
  AnswerSource,
  AskedQuestion,
  CheckField,
  CheckStatus,
  CoverLetterSuggestion,
  EndReason,
  FallbackEvent,
  InterviewerId,
  InterviewSession,
  MainQuestion,
  QuestionKind,
} from './types.js';

export type InterviewErrorCode = 'not_found' | 'invalid_input' | 'ended' | 'not_ended' | 'conflict';

/** 엔진이 던지는 오류. 서버는 code로 HTTP 상태를 정한다(not_found→404, invalid_input→400, 나머지→409). */
export class InterviewError extends Error {
  constructor(
    public readonly code: InterviewErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InterviewError';
  }
}

export interface EngineOptions {
  store: SessionStore;
  /** null이면 AI 없이 기본 질문으로만 진행한다(키가 없을 때 앱이 계속 동작하도록). */
  llm: LlmClient | null;
  limits?: Partial<Limits>;
  now?: () => number;
  random?: () => number;
  newId?: () => string;
  /** 꼬리질문 판단 때 함께 보낼 앞 주제 질문·답변 수(비용 절감용) */
  recentOtherAnswers?: number;
}

export interface CurrentQuestionView {
  questionId: string;
  interviewer: InterviewerId;
  interviewerLabel: string;
  kind: QuestionKind;
  text: string;
  purpose: string;
  basisSentence: string | null;
  fallback: boolean;
}

export interface InterviewView {
  sessionId: string;
  status: InterviewSession['status'];
  endReason: EndReason | null;
  current: CurrentQuestionView | null;
  questionCount: number;
  maxQuestions: number;
  elapsedMs: number;
  remainingMs: number;
  /** AI 대신 기본 동작을 쓴 적이 있으면 true */
  usedFallback: boolean;
}

export interface ResultLogItem {
  questionId: string;
  interviewer: InterviewerId;
  interviewerLabel: string;
  kind: QuestionKind;
  purpose: string;
  question: string;
  reason: string | null;
  answer: Answer | null;
}

export interface ResultFieldItem {
  mainId: string;
  field: CheckField;
  fieldLabel: string;
  status: CheckStatus;
  answerIds: string[];
}

export interface InterviewResult {
  sessionId: string;
  endReason: EndReason | null;
  log: ResultLogItem[];
  /** 면접에서 설명된 항목 */
  explained: ResultFieldItem[];
  /** 아직 보완할 항목(최대 3개) */
  toImprove: ResultFieldItem[];
  suggestions: CoverLetterSuggestion[];
  /** 수정 제안을 못 만들었을 때의 오류 코드(다시 부르면 재시도) */
  suggestionsError: string | null;
  fallbackEvents: FallbackEvent[];
}

const STATUS_PRIORITY: Record<CheckStatus, number> = {
  needs_more: 0,
  unknown: 1,
  unchecked: 2,
  explained: 9,
};

export class InterviewEngine {
  private readonly store: SessionStore;
  private readonly llm: LlmClient | null;
  private readonly limits: Limits;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly newId: () => string;
  private readonly recentOtherAnswers: number;

  constructor(opts: EngineOptions) {
    this.store = opts.store;
    this.llm = opts.llm;
    this.limits = { ...DEFAULT_LIMITS, ...opts.limits };
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.newId = opts.newId ?? randomUUID;
    this.recentOtherAnswers = opts.recentOtherAnswers ?? 4;
  }

  /** 면접 시작: 본질문 4개 생성(AI 1회) → 순서 랜덤 → 첫 질문 */
  async start(input: { userId: string; resume: string; coverLetter: string }): Promise<InterviewView> {
    const resume = (input.resume ?? '').trim();
    const coverLetter = (input.coverLetter ?? '').trim();
    if (!input.userId) throw new InterviewError('invalid_input', '로그인이 필요해요.');
    if (!resume && !coverLetter) {
      throw new InterviewError('invalid_input', '이력서나 자소서를 먼저 입력해 주세요.');
    }
    if (resume.length > this.limits.maxInputChars || coverLetter.length > this.limits.maxInputChars) {
      throw new InterviewError(
        'invalid_input',
        `이력서와 자소서는 각각 ${this.limits.maxInputChars.toLocaleString()}자까지 넣을 수 있어요.`,
      );
    }

    const fallbackEvents: FallbackEvent[] = [];
    const mains = await this.buildMainQuestions(resume, coverLetter, fallbackEvents);
    shuffle(mains, this.random);

    const nowMs = this.now();
    const session: InterviewSession = {
      id: this.newId(),
      userId: input.userId,
      version: 1,
      resume,
      coverLetter,
      status: 'in_progress',
      endReason: null,
      createdAt: new Date(nowMs).toISOString(),
      startedAtMs: nowMs,
      endedAt: null,
      mainQuestions: mains,
      currentMainIndex: 0,
      followUpsOnCurrent: 0,
      asked: [],
      answers: [],
      checks: Object.fromEntries(mains.map((m) => [m.id, {}])),
      skippedMainIds: [],
      fallbackEvents,
      suggestions: null,
    };
    this.askMain(session, 0);
    await this.store.create(session);
    return this.view(session);
  }

  async get(sessionId: string, userId: string): Promise<InterviewView> {
    return this.view(await this.load(sessionId, userId));
  }

  /**
   * 답변 저장 → 확인 상태 갱신·다음 행동 판단(AI 1회) → 꼬리질문 또는 다음 본질문 → 한도면 종료.
   * questionId는 화면에 떠 있던 질문 id. 다르면(두 번 누름 등) conflict.
   */
  async answer(
    sessionId: string,
    userId: string,
    input: { questionId: string; text: string; source?: AnswerSource },
  ): Promise<InterviewView> {
    const session = await this.load(sessionId, userId);
    this.ensureInProgress(session);
    const current = session.asked.at(-1);
    if (!current || current.id !== input.questionId) {
      throw new InterviewError('conflict', '이미 넘어간 질문이에요. 화면을 새로고침해 주세요.');
    }
    const text = (input.text ?? '').trim();
    if (!text) throw new InterviewError('invalid_input', '답변을 입력해 주세요.');
    if (text.length > this.limits.maxAnswerChars) {
      throw new InterviewError(
        'invalid_input',
        `답변은 ${this.limits.maxAnswerChars.toLocaleString()}자까지 넣을 수 있어요.`,
      );
    }

    const answer: Answer = {
      id: `A${session.answers.length + 1}`,
      questionId: current.id,
      text,
      source: input.source === 'voice' ? 'voice' : 'text',
      answeredAt: this.isoNow(),
    };
    session.answers.push(answer);

    const main = this.currentMain(session);
    const turn = await this.decideTurn(session, main, answer);
    if (turn) this.applyCheckUpdates(session, main, turn, answer.id);

    if (session.asked.length >= this.limits.maxQuestions) {
      this.finish(session, 'question_limit');
    } else if (this.elapsed(session) >= this.limits.maxDurationMs) {
      this.finish(session, 'time_limit');
    } else {
      const followUp = turn ? this.acceptFollowUp(session, main, turn) : null;
      if (followUp) {
        session.asked.push(followUp);
        session.followUpsOnCurrent += 1;
      } else {
        this.advance(session);
      }
    }
    await this.persist(session);
    return this.view(session);
  }

  /** 현재 주제(본질문과 그 꼬리질문)를 건너뛰고 다음 본질문으로 */
  async skip(sessionId: string, userId: string): Promise<InterviewView> {
    const session = await this.load(sessionId, userId);
    this.ensureInProgress(session);
    session.skippedMainIds.push(this.currentMain(session).id);
    if (this.elapsed(session) >= this.limits.maxDurationMs) this.finish(session, 'time_limit');
    else this.advance(session);
    await this.persist(session);
    return this.view(session);
  }

  /** 사용자가 면접 종료. 이미 끝났으면 그대로 돌려준다. */
  async end(sessionId: string, userId: string): Promise<InterviewView> {
    const session = await this.load(sessionId, userId);
    if (session.status === 'ended') return this.view(session);
    this.finish(session, 'user_ended');
    await this.persist(session);
    return this.view(session);
  }

  /** 면접 결과. 처음 부를 때 자소서 수정 제안을 만든다(AI 1회). */
  async result(sessionId: string, userId: string): Promise<InterviewResult> {
    const session = await this.load(sessionId, userId);
    if (session.status !== 'ended') throw new InterviewError('not_ended', '면접이 아직 끝나지 않았어요.');

    let suggestionsError: string | null = null;
    if (session.suggestions === null && session.answers.length > 0) {
      try {
        session.suggestions = await this.buildSuggestions(session);
        await this.persist(session);
      } catch (err) {
        if (err instanceof ConflictError) throw new InterviewError('conflict', err.message);
        suggestionsError = err instanceof LlmError ? err.code : 'unknown';
        session.fallbackEvents.push({ stage: 'suggestions', reason: suggestionsError, at: this.isoNow() });
      }
    }

    const answerOf = (qid: string) => session.answers.find((a) => a.questionId === qid) ?? null;
    const purposeOf = (mainId: string) => session.mainQuestions.find((m) => m.id === mainId)?.purpose ?? '';
    const log: ResultLogItem[] = session.asked.map((q) => ({
      questionId: q.id,
      interviewer: q.interviewer,
      interviewerLabel: INTERVIEWER_LABEL[q.interviewer],
      kind: q.kind,
      purpose: purposeOf(q.mainId),
      question: q.text,
      reason: q.reason,
      answer: answerOf(q.id),
    }));

    const askedMainIds = new Set(session.asked.map((q) => q.mainId));
    const fields: ResultFieldItem[] = [];
    for (const main of session.mainQuestions) {
      if (!askedMainIds.has(main.id)) continue;
      for (const field of main.fields) {
        const state = session.checks[main.id]?.[field];
        fields.push({
          mainId: main.id,
          field,
          fieldLabel: FIELD_LABEL[field],
          status: state?.status ?? 'unchecked',
          answerIds: state?.answerIds ?? [],
        });
      }
    }
    const skipped = new Set(session.skippedMainIds);
    const toImprove = fields
      .filter((f) => f.status !== 'explained' && !skipped.has(f.mainId))
      .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status])
      .slice(0, 3);

    return {
      sessionId: session.id,
      endReason: session.endReason,
      log,
      explained: fields.filter((f) => f.status === 'explained'),
      toImprove,
      suggestions: session.suggestions ?? [],
      suggestionsError,
      fallbackEvents: session.fallbackEvents,
    };
  }

  /** 수정 제안 승인: 자소서의 해당 문장을 바꾸고 바뀐 자소서를 돌려준다. 앱이 자기 자소서 저장소에도 반영한다. */
  async approveSuggestion(
    sessionId: string,
    userId: string,
    suggestionId: string,
  ): Promise<{ coverLetter: string; suggestion: CoverLetterSuggestion }> {
    const session = await this.load(sessionId, userId);
    const suggestion = session.suggestions?.find((s) => s.id === suggestionId);
    if (!suggestion) throw new InterviewError('not_found', '수정 제안을 찾을 수 없어요.');
    if (suggestion.status !== 'pending') {
      throw new InterviewError('conflict', '이미 처리한 수정 제안이에요.');
    }
    if (!session.coverLetter.includes(suggestion.original)) {
      suggestion.status = 'stale';
    } else {
      session.coverLetter = session.coverLetter.replace(suggestion.original, suggestion.revised);
      suggestion.status = 'applied';
    }
    await this.persist(session);
    if (suggestion.status === 'stale') {
      throw new InterviewError('conflict', '자소서의 원래 문장이 바뀌어 적용할 수 없어요.');
    }
    return { coverLetter: session.coverLetter, suggestion };
  }

  async rejectSuggestion(sessionId: string, userId: string, suggestionId: string): Promise<CoverLetterSuggestion> {
    const session = await this.load(sessionId, userId);
    const suggestion = session.suggestions?.find((s) => s.id === suggestionId);
    if (!suggestion) throw new InterviewError('not_found', '수정 제안을 찾을 수 없어요.');
    if (suggestion.status !== 'pending') throw new InterviewError('conflict', '이미 처리한 수정 제안이에요.');
    suggestion.status = 'rejected';
    await this.persist(session);
    return suggestion;
  }

  // ---- 내부 ----

  private async buildMainQuestions(
    resume: string,
    coverLetter: string,
    events: FallbackEvent[],
  ): Promise<MainQuestion[]> {
    const per = this.limits.mainPerInterviewer;
    let generated: MainQuestionsOutput['questions'] = [];
    if (this.llm) {
      try {
        const { system, user } = mainQuestionsPrompt(resume, coverLetter, per);
        const out = await this.llm.json({
          system,
          user,
          schemaName: 'main_questions',
          schema: MainQuestionsSchema,
          maxTokens: 1500,
        });
        generated = out.questions;
      } catch (err) {
        events.push({ stage: 'questions', reason: errorCode(err), at: this.isoNow() });
      }
    } else {
      events.push({ stage: 'questions', reason: 'no_llm', at: this.isoNow() });
    }

    const sources = [coverLetter, resume].filter(Boolean);
    const mains: MainQuestion[] = [];
    let filled = false;
    for (const interviewer of INTERVIEWERS) {
      const allowed = INTERVIEWER_FIELDS[interviewer];
      const valid = generated
        .filter((q) => q.interviewer === interviewer)
        .map((q) => ({
          ...q,
          fields: unique(q.fields.filter((f) => allowed.includes(f))),
          question: q.question.trim(),
          purpose: q.purpose.trim(),
        }))
        .filter((q) => q.fields.length > 0 && q.question && q.question.length <= this.limits.maxQuestionChars)
        .slice(0, per);
      for (const q of valid) {
        mains.push({
          id: '',
          interviewer,
          purpose: q.purpose.slice(0, 200) || q.fields.map((f) => FIELD_LABEL[f]).join('·'),
          fields: q.fields,
          basisSentence: verbatimIn(q.basis_sentence, sources),
          text: q.question,
          fallback: false,
        });
      }
      const templates = FALLBACK_QUESTIONS[interviewer];
      for (let i = valid.length; i < per; i++) {
        const t = templates[i % templates.length]!;
        mains.push({ id: '', interviewer, purpose: t.purpose, fields: [...t.fields], basisSentence: null, text: t.text, fallback: true });
        filled = true;
      }
    }
    if (filled && events.length === 0) {
      events.push({ stage: 'questions', reason: 'incomplete', at: this.isoNow() });
    }
    mains.forEach((m, i) => (m.id = `M${i + 1}`));
    return mains;
  }

  private async decideTurn(session: InterviewSession, main: MainQuestion, answer: Answer): Promise<TurnOutput | null> {
    if (!this.llm) {
      session.fallbackEvents.push({ stage: 'turn', reason: 'no_llm', at: this.isoNow() });
      return null;
    }
    try {
      const { system, user } = turnPrompt(
        session,
        main,
        answer,
        this.limits.maxFollowUpsPerMain,
        this.recentOtherAnswers,
      );
      return await this.llm.json({ system, user, schemaName: 'interview_turn', schema: TurnSchema, maxTokens: 600 });
    } catch (err) {
      session.fallbackEvents.push({ stage: 'turn', reason: errorCode(err), at: this.isoNow() });
      return null;
    }
  }

  private applyCheckUpdates(session: InterviewSession, main: MainQuestion, turn: TurnOutput, answerId: string) {
    const states = (session.checks[main.id] ??= {});
    for (const u of turn.check_updates) {
      if (!main.fields.includes(u.field)) continue;
      const prev = states[u.field] ?? { status: 'unchecked', rephrased: false, answerIds: [] };
      states[u.field] = {
        status: u.status,
        rephrased: prev.rephrased,
        answerIds: prev.answerIds.includes(answerId) ? prev.answerIds : [...prev.answerIds, answerId],
      };
    }
  }

  /** AI가 낸 꼬리질문을 서버 규칙으로 검사한다. 맞지 않으면 null(다음 본질문으로). */
  private acceptFollowUp(session: InterviewSession, main: MainQuestion, turn: TurnOutput): AskedQuestion | null {
    if (turn.decision === 'next_main') return null;
    if (session.followUpsOnCurrent >= this.limits.maxFollowUpsPerMain) return null;
    const text = turn.question?.trim() ?? '';
    if (!text || text.length > this.limits.maxQuestionChars) return null;

    const answerIds = new Set(session.answers.map((a) => a.id));
    if (!turn.basis_answer_id || !answerIds.has(turn.basis_answer_id)) return null;

    if (turn.decision === 'clarify') {
      const other = turn.conflicting_answer_id;
      if (!other || !answerIds.has(other) || other === turn.basis_answer_id) return null;
    }

    const field = turn.target_field;
    if (turn.decision === 'follow_up' && !field) return null;
    if (field) {
      if (!main.fields.includes(field)) return null;
      const states = (session.checks[main.id] ??= {});
      const state = states[field];
      if (state?.status === 'explained') return null;
      if (state?.status === 'unknown') {
        if (state.rephrased) return null;
        state.rephrased = true;
      }
    }

    return {
      id: `Q${session.asked.length + 1}`,
      mainId: main.id,
      interviewer: main.interviewer,
      kind: turn.decision,
      text,
      reason: turn.reason.trim().slice(0, 200) || null,
      targetField: field,
      basisAnswerId: turn.basis_answer_id,
      conflictingAnswerId: turn.decision === 'clarify' ? turn.conflicting_answer_id : null,
      fallback: false,
      askedAt: this.isoNow(),
    };
  }

  private async buildSuggestions(session: InterviewSession): Promise<CoverLetterSuggestion[]> {
    if (!this.llm) throw new LlmError('no_key');
    if (!session.coverLetter) return [];
    const { system, user } = suggestionsPrompt(session, this.limits.maxSuggestions);
    const out = await this.llm.json({ system, user, schemaName: 'cover_letter_suggestions', schema: SuggestionsSchema, maxTokens: 1200 });
    const answerIds = new Set(session.answers.map((a) => a.id));
    const seen = new Set<string>();
    const result: CoverLetterSuggestion[] = [];
    for (const s of out.suggestions) {
      const original = s.original.trim();
      const revised = s.revised.trim();
      if (!original || !revised || original === revised) continue;
      if (!session.coverLetter.includes(original) || seen.has(original)) continue;
      if (!answerIds.has(s.answer_id)) continue;
      seen.add(original);
      result.push({
        id: `S${result.length + 1}`,
        original,
        revised,
        reason: s.reason.trim().slice(0, 300),
        answerId: s.answer_id,
        status: 'pending',
      });
      if (result.length >= this.limits.maxSuggestions) break;
    }
    return result;
  }

  private askMain(session: InterviewSession, index: number) {
    const main = session.mainQuestions[index]!;
    session.currentMainIndex = index;
    session.followUpsOnCurrent = 0;
    session.asked.push({
      id: `Q${session.asked.length + 1}`,
      mainId: main.id,
      interviewer: main.interviewer,
      kind: 'main',
      text: main.text,
      reason: null,
      targetField: null,
      basisAnswerId: null,
      conflictingAnswerId: null,
      fallback: main.fallback,
      askedAt: this.isoNow(),
    });
  }

  private advance(session: InterviewSession) {
    const next = session.currentMainIndex + 1;
    if (next >= session.mainQuestions.length) this.finish(session, 'completed');
    else if (session.asked.length >= this.limits.maxQuestions) this.finish(session, 'question_limit');
    else this.askMain(session, next);
  }

  private finish(session: InterviewSession, reason: EndReason) {
    session.status = 'ended';
    session.endReason = reason;
    session.endedAt = this.isoNow();
  }

  private currentMain(session: InterviewSession): MainQuestion {
    return session.mainQuestions[session.currentMainIndex]!;
  }

  private ensureInProgress(session: InterviewSession) {
    if (session.status !== 'in_progress') throw new InterviewError('ended', '이미 끝난 면접이에요.');
  }

  private async load(sessionId: string, userId: string): Promise<InterviewSession> {
    const session = await this.store.get(sessionId);
    // 다른 사용자의 면접은 없는 것처럼 다룬다.
    if (!session || session.userId !== userId) throw new InterviewError('not_found', '면접을 찾을 수 없어요.');
    return session;
  }

  private async persist(session: InterviewSession) {
    const expected = session.version;
    session.version = expected + 1;
    try {
      await this.store.save(session, expected);
    } catch (err) {
      if (err instanceof ConflictError) throw new InterviewError('conflict', err.message);
      throw err;
    }
  }

  private view(session: InterviewSession): InterviewView {
    const elapsedMs = Math.min(this.elapsed(session), this.limits.maxDurationMs);
    const q = session.status === 'in_progress' ? session.asked.at(-1) : undefined;
    const main = q ? session.mainQuestions.find((m) => m.id === q.mainId) : undefined;
    return {
      sessionId: session.id,
      status: session.status,
      endReason: session.endReason,
      current:
        q && main
          ? {
              questionId: q.id,
              interviewer: q.interviewer,
              interviewerLabel: INTERVIEWER_LABEL[q.interviewer],
              kind: q.kind,
              text: q.text,
              purpose: main.purpose,
              basisSentence: main.basisSentence,
              fallback: q.fallback,
            }
          : null,
      questionCount: session.asked.length,
      maxQuestions: this.limits.maxQuestions,
      elapsedMs,
      remainingMs: this.limits.maxDurationMs - elapsedMs,
      usedFallback: session.fallbackEvents.length > 0,
    };
  }

  private elapsed(session: InterviewSession) {
    return this.now() - session.startedAtMs;
  }

  private isoNow() {
    return new Date(this.now()).toISOString();
  }
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/** AI가 고른 근거 문장이 실제 자료에 그대로 있을 때만 남긴다. */
function verbatimIn(sentence: string | null, sources: string[]): string | null {
  if (!sentence) return null;
  const s = normalize(sentence);
  if (s.length < 5) return null;
  return sources.some((src) => normalize(src).includes(s)) ? s : null;
}

function errorCode(err: unknown): string {
  return err instanceof LlmError ? err.code : 'unknown';
}
