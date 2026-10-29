import type { Collection } from 'mongodb';
import { ConflictError, type SessionStore } from './store.js';
import type { InterviewSession } from './types.js';

export type InterviewSessionDoc = InterviewSession & { _id: string };

/**
 * MongoDB 저장소. 연결은 앱이 만들고 컬렉션만 넘긴다.
 *   const col = client.db('app').collection<InterviewSessionDoc>('interview_sessions');
 *   await MongoSessionStore.ensureIndexes(col);
 *   const store = new MongoSessionStore(col);
 */
export class MongoSessionStore implements SessionStore {
  constructor(private readonly col: Collection<InterviewSessionDoc>) {}

  static async ensureIndexes(col: Collection<InterviewSessionDoc>): Promise<void> {
    await col.createIndex({ userId: 1, createdAt: -1 });
  }

  async create(session: InterviewSession): Promise<void> {
    await this.col.insertOne({ ...session, _id: session.id });
  }

  async get(id: string): Promise<InterviewSession | null> {
    const doc = await this.col.findOne({ _id: id });
    if (!doc) return null;
    const { _id, ...session } = doc;
    return session;
  }

  async save(session: InterviewSession, expectedVersion: number): Promise<void> {
    const result = await this.col.replaceOne({ _id: session.id, version: expectedVersion }, { ...session });
    if (result.matchedCount === 0) throw new ConflictError();
  }
}
