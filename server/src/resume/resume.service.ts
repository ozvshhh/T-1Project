import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { parseObjectIdOr404 } from '../common/ownership';
import { ActivityDraft, DraftOrigin, Resume } from './resume.schema';
import { DraftInput } from './resume.validation';

type DraftRecord = ActivityDraft & { _id: Types.ObjectId };
type ResumeRecord = Resume & { _id: Types.ObjectId };

// api.md 2절 ActivityDraft·Resume 응답 모양.
export interface ActivityDraftDto {
  id: string;
  title: string;
  period: string;
  summary: string;
  origin: DraftOrigin;
}

export interface ResumeDto {
  text: string | null;
  drafts: ActivityDraftDto[];
  updatedAt: string | null;
}

export function toDraftDto(draft: DraftRecord): ActivityDraftDto {
  return {
    id: String(draft._id),
    title: draft.title,
    period: draft.period ?? '',
    summary: draft.summary ?? '',
    origin: draft.origin,
  };
}

// 남의 초안·없는 초안을 같은 본문으로 돌려줘 다른 계정의 초안이 있는지 알 수 없게 한다(common/ownership과 같은 본문).
function draftNotFound(): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' });
}

@Injectable()
export class ResumeService {
  constructor(@InjectModel(Resume.name) private readonly resumes: Model<Resume>) {}

  // 아직 문서가 없으면 만들지 않고 빈 이력서 모양만 돌려준다: 조회만으로 DB에 쓰지 않는다.
  async get(userId: string): Promise<ResumeDto> {
    const doc = await this.resumes.findOne({ userId: new Types.ObjectId(userId) }).lean<ResumeRecord>();
    if (!doc) return { text: null, drafts: [], updatedAt: null };
    return {
      text: doc.text ?? null,
      drafts: (doc.drafts ?? []).map(toDraftDto),
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
    };
  }

  // 문서가 없으면 text: null로 만들면서 초안을 넣는다(명세 10). upsert 한 번이라 동시 요청에도 계정당 문서가 하나다.
  // 붙여넣은 글이 바뀐 게 아니므로 updatedAt은 건드리지 않는다.
  async addDraft(userId: string, input: DraftInput): Promise<ActivityDraftDto> {
    const draftId = new Types.ObjectId();
    await this.resumes.updateOne(
      { userId: new Types.ObjectId(userId) },
      {
        $push: { drafts: { _id: draftId, ...input, origin: 'manual' } },
        $setOnInsert: { text: null, updatedAt: null },
      },
      { upsert: true },
    );
    return { id: String(draftId), ...input, origin: 'manual' };
  }

  // 토큰 사용자의 문서 안에서만 초안을 찾는다: 남의 초안 id를 보내도 조건에 걸리지 않아 404가 된다.
  async updateDraft(userId: string, draftId: string, input: Partial<DraftInput>): Promise<ActivityDraftDto> {
    const oid = parseObjectIdOr404(draftId);
    const filter = { userId: new Types.ObjectId(userId), 'drafts._id': oid };
    const set = Object.fromEntries(Object.entries(input).map(([key, value]) => [`drafts.$.${key}`, value]));
    const doc =
      Object.keys(set).length === 0
        ? await this.resumes.findOne(filter).lean<ResumeRecord>()
        : await this.resumes
            .findOneAndUpdate(filter, { $set: set }, { returnDocument: 'after' })
            .lean<ResumeRecord>();
    const draft = doc?.drafts.find((d) => d._id.equals(oid));
    if (!draft) throw draftNotFound();
    return toDraftDto(draft);
  }

  async deleteDraft(userId: string, draftId: string): Promise<void> {
    const oid = parseObjectIdOr404(draftId);
    const result = await this.resumes.updateOne(
      { userId: new Types.ObjectId(userId), 'drafts._id': oid },
      { $pull: { drafts: { _id: oid } } },
    );
    if (result.matchedCount === 0) throw draftNotFound();
  }
}
