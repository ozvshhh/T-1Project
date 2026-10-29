/** Nest DI 토큰. 생성자 주입은 모두 @Inject(토큰)으로 해서 decorator metadata 없이도 동작한다. */
export const INTERVIEW_ENGINE = Symbol('INTERVIEW_ENGINE');
export const INTERVIEW_MONGO_CLIENT = Symbol('INTERVIEW_MONGO_CLIENT');
