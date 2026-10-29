import type { CheckField, EndReason, InterviewerId } from './types.js';

/** 결과 화면에 보여 줄 종료 사유 (S5: '사용자 종료') */
export const END_REASON_LABEL: Record<EndReason, string> = {
  completed: '모든 질문 완료',
  user_ended: '사용자 종료',
  question_limit: '질문 수 한도',
  time_limit: '시간 한도',
};

export interface Limits {
  mainPerInterviewer: number;
  maxFollowUpsPerMain: number;
  maxQuestions: number;
  maxDurationMs: number;
  /** 이력서·자소서 각각의 최대 글자 수 */
  maxInputChars: number;
  maxAnswerChars: number;
  maxQuestionChars: number;
  maxSuggestions: number;
}

/** docs/interview-design.md의 초기값. 써 본 뒤 조정한다. */
export const DEFAULT_LIMITS: Limits = {
  mainPerInterviewer: 2,
  maxFollowUpsPerMain: 2,
  maxQuestions: 12,
  maxDurationMs: 12 * 60 * 1000,
  maxInputChars: 20_000,
  maxAnswerChars: 4_000,
  maxQuestionChars: 300,
  maxSuggestions: 3,
};

export const INTERVIEWERS: readonly InterviewerId[] = ['practical', 'executive'];

export const INTERVIEWER_FIELDS: Record<InterviewerId, readonly CheckField[]> = {
  practical: ['contribution', 'process', 'reason', 'verification'],
  executive: ['collaboration', 'judgment', 'after_failure'],
};

export const INTERVIEWER_LABEL: Record<InterviewerId, string> = {
  practical: '실무 면접관',
  executive: '임원 면접관',
};

export const FIELD_LABEL: Record<CheckField, string> = {
  contribution: '본인 기여',
  process: '문제 해결 과정',
  reason: '선택 이유',
  verification: '검증 방법',
  collaboration: '협업 과정',
  judgment: '책임 있는 판단',
  after_failure: '실패 이후 행동',
};
