import type { CheckField, InterviewerId } from './types.js';

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
