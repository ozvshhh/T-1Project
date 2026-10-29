/** Nest DI 토큰. 생성자 주입은 모두 @Inject(토큰)으로 해서 decorator metadata 없이도 동작한다. */
export const INTERVIEW_ENGINE = Symbol('INTERVIEW_ENGINE');
export const INTERVIEW_MONGO_CLIENT = Symbol('INTERVIEW_MONGO_CLIENT');
/** 앱이 CoverLetterSource를 구현한 provider를 이 토큰으로 내주면 면접 모듈이 쓴다. */
export const INTERVIEW_COVER_LETTERS = Symbol('INTERVIEW_COVER_LETTERS');
