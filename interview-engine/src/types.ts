export type InterviewerId = 'practical' | 'executive';

export type CheckField =
  | 'contribution'
  | 'process'
  | 'reason'
  | 'verification'
  | 'collaboration'
  | 'judgment'
  | 'after_failure';

/** unchecked: 아직 안 물음 / explained: 설명됨 / needs_more: 추가 확인 필요 / unknown: 모름·경험 없음 */
export type CheckStatus = 'unchecked' | 'explained' | 'needs_more' | 'unknown';

export type QuestionKind = 'main' | 'follow_up' | 'clarify';

export type EndReason = 'completed' | 'user_ended' | 'question_limit' | 'time_limit';

/**
 * 앱의 이력서·자기소개서 저장소(F2·F3·F4)와 면접을 잇는 창구. 백엔드가 구현해서 넘긴다.
 * - 면접을 자기소개서 id로 시작할 때 본문을 서버에서 읽는다(화면이 보낸 글을 믿지 않는다).
 * - 수정 제안을 승인하면 그 자기소개서 본문을 바꿔 저장한다(F8).
 */
export interface CoverLetterSource {
  /** 사용자의 이력서를 면접용 글 한 덩어리로. 없으면 '' */
  getResumeText(userId: string): Promise<string>;
  /** 본인의 자기소개서 본문. 없거나 남의 것이면 null */
  getCoverLetter(userId: string, coverLetterId: string): Promise<string | null>;
  updateCoverLetter(userId: string, coverLetterId: string, body: string): Promise<void>;
}

export type AnswerSource = 'text' | 'voice';

export interface MainQuestion {
  id: string;
  interviewer: InterviewerId;
  purpose: string;
  fields: CheckField[];
  /** 질문의 근거가 된 자소서·이력서 문장(원문 그대로). 찾지 못하면 null */
  basisSentence: string | null;
  text: string;
  /** 기본 질문 템플릿을 썼으면 true */
  fallback: boolean;
}

export interface AskedQuestion {
  id: string;
  mainId: string;
  interviewer: InterviewerId;
  kind: QuestionKind;
  text: string;
  /** 꼬리질문을 고른 이유(본질문은 null) */
  reason: string | null;
  targetField: CheckField | null;
  basisAnswerId: string | null;
  conflictingAnswerId: string | null;
  fallback: boolean;
  askedAt: string;
}

export interface Answer {
  id: string;
  questionId: string;
  text: string;
  source: AnswerSource;
  answeredAt: string;
}

export interface FieldState {
  status: CheckStatus;
  /** '모름' 답변 뒤 한 번 쉽게 바꿔 물었는지 */
  rephrased: boolean;
  answerIds: string[];
}

export interface FallbackEvent {
  stage: 'questions' | 'turn' | 'suggestions';
  reason: string;
  at: string;
}

export type SuggestionStatus = 'pending' | 'applied' | 'rejected' | 'stale';

export interface CoverLetterSuggestion {
  id: string;
  original: string;
  revised: string;
  reason: string;
  answerId: string;
  status: SuggestionStatus;
}

export interface InterviewSession {
  id: string;
  userId: string;
  /** 동시에 두 번 저장되는 것을 막는 번호 */
  version: number;
  resume: string;
  /** 면접을 시작할 때의 자기소개서 본문(복사본) */
  coverLetter: string;
  /** 앱의 자기소개서 id. 글을 직접 넘겨 시작했으면 null */
  coverLetterId: string | null;
  status: 'in_progress' | 'ended';
  endReason: EndReason | null;
  createdAt: string;
  startedAtMs: number;
  endedAt: string | null;
  /** 랜덤으로 정한 뒤 바꾸지 않는 본질문 순서 */
  mainQuestions: MainQuestion[];
  currentMainIndex: number;
  followUpsOnCurrent: number;
  asked: AskedQuestion[];
  answers: Answer[];
  /** mainId → 확인 항목별 상태 */
  checks: Record<string, Partial<Record<CheckField, FieldState>>>;
  skippedMainIds: string[];
  fallbackEvents: FallbackEvent[];
  suggestions: CoverLetterSuggestion[] | null;
}
