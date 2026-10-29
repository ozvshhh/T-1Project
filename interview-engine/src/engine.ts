import { randomUUID } from 'node:crypto';
import {
  DEFAULT_LIMITS,
  END_REASON_LABEL,
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
  CoverLetterSource,
  CoverLetterSuggestion,
  EndReason,
  FallbackEvent,
  FieldState,
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
  /** 앱의 이력서·자기소개서 저장소. 있으면 자기소개서 id로 시작하고, 승인한 수정 제안을 그 자기소개서에 저장한다. */
  coverLetters?: CoverLetterSource | null;
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

export interface HistoryItem {
  questionId: string;
  interviewer: InterviewerId;
  interviewerLabel: string;
  kind: QuestionKind;
  question: string;
  answer: string | null;
}

export interface InterviewView {
  sessionId: string;
  status: InterviewSession['status'];
  endReason: EndReason | null;
  /** 예: '사용자 종료' */
  endReasonLabel: string | null;
  current: CurrentQuestionView | null;
  /** 지금까지의 질문·답변 기록(면접 화면에 쌓아 보여 줄 것) */
  history: HistoryItem[];
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

/** 면접 기록 목록의 한 줄 */
export interface InterviewSummary {
  sessionId: string;
  status: InterviewSession['status'];
  endReason: EndReason | null;
  endReasonLabel: string | null;
  coverLetterId: string | null;
  /** 자기소개서 앞부분(목록 표시용) */
  coverLetterPreview: string;
  questionCount: number;
  answerCount: number;
  pendingSuggestions: number;
  createdAt: string;
  endedAt: string | null;
}

/** 시드용 끝난 면접(S6). 질문·답변·수정 제안 내용은 앱의 시드 코드가 정한다. */
export interface SeedFinishedInput {
  /** 고정 id. 이미 있으면 만들지 않는다(앱을 다시 켜도 하나만). */
  id: string;
  userId: string;
  resume: string;
  coverLetter: string;
  coverLetterId?: string | null;
  qa: {
    interviewer: InterviewerId;
    purpose: string;
    fields: CheckField[];
    question: string;
    answer: string;
    /** 이 답변으로 설명된 항목 */
    explained?: CheckField[];
  }[];
  /** answerIndex: 근거가 된 qa의 순번(0부터). original은 coverLetter에 그대로 있어야 한다. */
  suggestions?: { original: string; revised: string; reason: string; answerIndex: number }[];
  endReason?: EndReason;
}

export interface InterviewResult {
  sessionId: string;
  endReason: EndReason | null;
  endReasonLabel: string | null;
  coverLetterId: string | null;
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
  private readonly coverLetters: CoverLetterSource | null;
  private readonly limits: Limits;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly newId: () => string;
  private readonly recentOtherAnswers: number;

  constructor(opts: EngineOptions) {
    this.store = opts.store;
    this.llm = opts.llm;
    this.coverLetters = opts.coverLetters ?? null;
    this.limits = { ...DEFAULT_LIMITS, ...opts.limits };
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.newId = opts.newId ?? randomUUID;
    this.recentOtherAnswers = opts.recentOtherAnswers ?? 4;
  }

  /**
   * 면접 시작: 본질문 4개 생성(AI 1회) → 순서 랜덤 → 첫 질문.
   * coverLetterId를 주면 앱의 저장소(coverLetters)에서 이력서·자기소개서를 읽는다(F5).
   * 저장소 없이 글을 직접 넘길 수도 있다(테스트·임시용).
   */
  async start(input: {
    userId: string;
    coverLetterId?: string | null;
    resume?: string;
    coverLetter?: string;
  }): Promise<InterviewView> {
    if (!input.userId) throw new InterviewError('invalid_input', '로그인이 필요해요.');
    let resume = (input.resume ?? '').trim();
    let coverLetter = (input.coverLetter ?? '').trim();
    const coverLetterId = input.coverLetterId?.trim() || null;
    if (coverLetterId) {
      if (!this.coverLetters) {
        throw new InterviewError('invalid_input', '자기소개서 저장소가 연결되지 않았어요.');
      }
      const body = await this.coverLetters.getCoverLetter(input.userId, coverLetterId);
      if (body === null) throw new InterviewError('not_found', '자기소개서를 찾을 수 없어요.');
      coverLetter = body.trim();
      resume = (await this.coverLetters.getResumeText(input.userId)).trim();
      if (!coverLetter) throw new InterviewError('invalid_input', '자기소개서 본문이 비어 있어요.');
    }
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
      coverLetterId,
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

  /** 내 면접 기록 목록, 최근 것부터 (F8 지난 결과 다시 보기, S6 '면접 기록') */
  async list(userId: string, limit = 50): Promise<InterviewSummary[]> {
    if (!userId) throw new InterviewError('invalid_input', '로그인이 필요해요.');
    const sessions = await this.store.listByUser(userId, Math.min(Math.max(limit, 1), 100));
    return sessions.map((s) => ({
      sessionId: s.id,
      status: s.status,
      endReason: s.endReason,
      endReasonLabel: s.endReason ? END_REASON_LABEL[s.endReason] : null,
      coverLetterId: s.coverLetterId ?? null,
      coverLetterPreview: s.coverLetter.replace(/\s+/g, ' ').slice(0, 60),
      questionCount: s.asked.length,
      answerCount: s.answers.length,
      pendingSuggestions: (s.suggestions ?? []).filter((x) => x.status === 'pending').length,
      createdAt: s.createdAt,
      endedAt: s.endedAt,
    }));
  }

  /**
   * 시드용 끝난 면접을 만든다(AI 호출 없음). 같은 id가 이미 있으면 아무것도 하지 않고 false.
   * 앱이 처음 뜰 때 시드 계정에 대해 부른다(S6).
   */
  async seedFinished(input: SeedFinishedInput): Promise<boolean> {
    if (await this.store.get(input.id)) return false;
    if (!input.userId || input.qa.length === 0) {
      throw new InterviewError('invalid_input', '시드 면접에는 사용자와 질문·답변이 하나 이상 필요해요.');
    }
    const at = this.isoNow();
    const nowMs = this.now();
    const mainQuestions: MainQuestion[] = [];
    const asked: AskedQuestion[] = [];
    const answers: Answer[] = [];
    const checks: InterviewSession['checks'] = {};
    input.qa.forEach((qa, i) => {
      const allowed = INTERVIEWER_FIELDS[qa.interviewer];
      const fields = unique(qa.fields.filter((f) => allowed.includes(f)));
      if (fields.length === 0) throw new InterviewError('invalid_input', `시드 질문 ${i + 1}의 확인 항목이 면접관과 맞지 않아요.`);
      const mainId = `M${i + 1}`;
      const qid = `Q${i + 1}`;
      const aid = `A${i + 1}`;
      mainQuestions.push({
        id: mainId,
        interviewer: qa.interviewer,
        purpose: qa.purpose,
        fields,
        basisSentence: null,
        text: qa.question,
        fallback: false,
      });
      asked.push({
        id: qid,
        mainId,
        interviewer: qa.interviewer,
        kind: 'main',
        text: qa.question,
        reason: null,
        targetField: null,
        basisAnswerId: null,
        conflictingAnswerId: null,
        fallback: false,
        askedAt: at,
      });
      answers.push({ id: aid, questionId: qid, text: qa.answer, source: 'text', answeredAt: at });
      const states: Partial<Record<CheckField, FieldState>> = {};
      checks[mainId] = states;
      for (const f of fields) {
        const explained = qa.explained?.includes(f) ?? false;
        states[f] = {
          status: explained ? 'explained' : 'needs_more',
          rephrased: false,
          answerIds: [aid],
        };
      }
    });
    const suggestions: CoverLetterSuggestion[] = (input.suggestions ?? []).map((s, i) => {
      if (!input.coverLetter.includes(s.original)) {
        throw new InterviewError('invalid_input', `시드 수정 제안 ${i + 1}의 원래 문장이 자기소개서에 없어요.`);
      }
      const answer = answers[s.answerIndex];
      if (!answer) throw new InterviewError('invalid_input', `시드 수정 제안 ${i + 1}의 근거 답변이 없어요.`);
      return { id: `S${i + 1}`, original: s.original, revised: s.revised, reason: s.reason, answerId: answer.id, status: 'pending' };
    });
    await this.store.create({
      id: input.id,
      userId: input.userId,
      version: 1,
      resume: input.resume,
      coverLetter: input.coverLetter,
      coverLetterId: input.coverLetterId ?? null,
      status: 'ended',
      endReason: input.endReason ?? 'user_ended',
      createdAt: at,
      startedAtMs: nowMs,
      endedAt: at,
      mainQuestions,
      currentMainIndex: mainQuestions.length - 1,
      followUpsOnCurrent: 0,
      asked,
      answers,
      checks,
      skippedMainIds: [],
      fallbackEvents: [],
      suggestions,
    });
    return true;
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
      endReasonLabel: session.endReason ? END_REASON_LABEL[session.endReason] : null,
      coverLetterId: session.coverLetterId ?? null,
      log,
      explained: fields.filter((f) => f.status === 'explained'),
      toImprove,
      suggestions: session.suggestions ?? [],
      suggestionsError,
      fallbackEvents: session.fallbackEvents,
    };
  }

  /**
   * 수정 제안 승인(F8): 자기소개서의 해당 문장을 바꾼다.
   * 면접이 자기소개서 id로 시작됐고 저장소가 연결돼 있으면, 지금 저장된 자기소개서 본문에 적용해 그곳에 저장한다.
   * 바뀐 자기소개서 전문을 돌려준다.
   */
  async approveSuggestion(
    sessionId: string,
    userId: string,
    suggestionId: string,
  ): Promise<{ coverLetter: string; coverLetterId: string | null; saved: boolean; suggestion: CoverLetterSuggestion }> {
    const session = await this.load(sessionId, userId);
    const suggestion = session.suggestions?.find((s) => s.id === suggestionId);
    if (!suggestion) throw new InterviewError('not_found', '수정 제안을 찾을 수 없어요.');
    if (suggestion.status !== 'pending') {
      throw new InterviewError('conflict', '이미 처리한 수정 제안이에요.');
    }

    const linked = Boolean(session.coverLetterId && this.coverLetters);
    let current = session.coverLetter;
    if (linked) {
      const stored = await this.coverLetters!.getCoverLetter(userId, session.coverLetterId!);
      if (stored === null) throw new InterviewError('not_found', '자기소개서를 찾을 수 없어요. 삭제되었을 수 있어요.');
      current = stored;
    }

    if (!current.includes(suggestion.original)) {
      suggestion.status = 'stale';
      await this.persist(session);
      throw new InterviewError('conflict', '자기소개서의 원래 문장이 바뀌어 적용할 수 없어요.');
    }

    const updated = current.replace(suggestion.original, suggestion.revised);
    if (linked) await this.coverLetters!.updateCoverLetter(userId, session.coverLetterId!, updated);
    session.coverLetter = updated;
    suggestion.status = 'applied';
    await this.persist(session);
    return { coverLetter: updated, coverLetterId: session.coverLetterId ?? null, saved: linked, suggestion };
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
    const history: HistoryItem[] = session.asked.map((asked) => ({
      questionId: asked.id,
      interviewer: asked.interviewer,
      interviewerLabel: INTERVIEWER_LABEL[asked.interviewer],
      kind: asked.kind,
      question: asked.text,
      answer: session.answers.find((a) => a.questionId === asked.id)?.text ?? null,
    }));
    return {
      sessionId: session.id,
      status: session.status,
      endReason: session.endReason,
      endReasonLabel: session.endReason ? END_REASON_LABEL[session.endReason] : null,
      history,
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
