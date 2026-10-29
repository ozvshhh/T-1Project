import type { InterviewSession } from './types.js';

/** 같은 면접을 두 요청이 동시에 저장하려 할 때(답변 두 번 누름 등) */
export class ConflictError extends Error {
  constructor() {
    super('면접 상태가 그사이 바뀌었어요. 화면을 새로고침해 주세요.');
    this.name = 'ConflictError';
  }
}

/** 면접 세션 저장소. MongoDB·PostgreSQL 등은 이 세 함수만 구현하면 붙는다. */
export interface SessionStore {
  create(session: InterviewSession): Promise<void>;
  get(id: string): Promise<InterviewSession | null>;
  /** expectedVersion과 저장된 version이 다르면 ConflictError */
  save(session: InterviewSession, expectedVersion: number): Promise<void>;
}

/** 테스트·로컬 개발용. 서버를 재시작하면 사라진다. */
export class MemorySessionStore implements SessionStore {
  private readonly data = new Map<string, string>();

  async create(session: InterviewSession): Promise<void> {
    if (this.data.has(session.id)) throw new ConflictError();
    this.data.set(session.id, JSON.stringify(session));
  }

  async get(id: string): Promise<InterviewSession | null> {
    const raw = this.data.get(id);
    return raw ? (JSON.parse(raw) as InterviewSession) : null;
  }

  async save(session: InterviewSession, expectedVersion: number): Promise<void> {
    const raw = this.data.get(session.id);
    if (!raw) throw new ConflictError();
    const current = JSON.parse(raw) as InterviewSession;
    if (current.version !== expectedVersion) throw new ConflictError();
    this.data.set(session.id, JSON.stringify(session));
  }
}
