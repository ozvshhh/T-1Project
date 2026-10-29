import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { parseObjectIdOr404 } from '../common/ownership';
import { ExperienceDto } from '../experiences/experience.dto';
import { Experience } from '../experiences/experience.schema';
import { ExperiencesService } from '../experiences/experiences.service';
import { buildResumeSplitInput, RESUME_SPLIT_SYSTEM, resumeSplitSchema } from './prompts';
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

// 문서가 없으면 빈 이력서 모양(api.md 2절): 프런트가 null·빈 배열로 "아직 붙여넣지 않음"을 판단한다.
function toResumeDto(doc: ResumeRecord | null): ResumeDto {
  if (!doc) return { text: null, drafts: [], updatedAt: null };
  return {
    text: doc.text ?? null,
    drafts: (doc.drafts ?? []).map(toDraftDto),
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
  };
}

// 남의 초안·없는 초안을 같은 본문으로 돌려줘 다른 계정의 초안이 있는지 알 수 없게 한다(common/ownership과 같은 본문).
function draftNotFound(): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' });
}

// 이력서 글의 「」·『』는 제목 표기일 뿐이라 저장할 때 뺀다. 그래야 이미 확정한 경험과 같은 이름으로 보인다.
function cleanTitle(title: string): string {
  return title.replace(/[「」『』]/g, '').replace(/\s+/g, ' ').trim();
}

// 중복 비교용 열쇠. AI가 괄호·따옴표·띄어쓰기를 조금 다르게 옮겨도 같은 활동으로 본다(실제 Gateway에서
// 「학과 공지 알림 앱」처럼 괄호를 붙여 이미 있는 경험이 초안으로 다시 들어온 적이 있다, 2026-10-30).
function titleKey(title: string): string {
  return title.normalize('NFC').replace(/[「」『』"'“”‘’\s]/g, '').toLowerCase();
}

// 이력서 줄 앞의 목록 기호(-, •, *)는 내용이 아니므로 뺀다(시드 summary와 같은 모양).
function cleanSummary(summary: string): string {
  return summary.trim().replace(/^[-•*]\s*/, '').trim();
}

@Injectable()
export class ResumeService {
  constructor(
    @InjectModel(Resume.name) private readonly resumes: Model<Resume>,
    @InjectModel(Experience.name) private readonly experiences: Model<Experience>,
    private readonly ai: AiService,
    // 확정 경험을 경험 API와 같은 모양으로 만들고 돌려주려고 경험 서비스를 쓴다.
    private readonly experienceCards: ExperiencesService,
  ) {}

  // 붙여넣은 글을 AI로 활동으로 나눠 새 활동만 ai 초안으로 더한다(api.md 4절 POST /api/resume).
  // AI가 성공한 뒤에만 text·drafts·updatedAt을 한 번에 저장한다: 실패(502)면 글도 바꾸지 않는다(C2).
  async paste(userId: string, text: string): Promise<{ resume: ResumeDto; added: ActivityDraftDto[] }> {
    const result = await this.ai.json({
      task: 'resume-split',
      system: RESUME_SPLIT_SYSTEM,
      user: buildResumeSplitInput(text),
      schema: resumeSplitSchema,
    });

    // 중복 판단은 내 경험·내 초안 제목으로만 한다: 남의 제목으로 내 활동이 빠지면 계정 사이에 정보가 샌다(R1).
    const owner = new Types.ObjectId(userId);
    const [myExperiences, myResume] = await Promise.all([
      this.experiences.find({ userId: owner }, { title: 1 }).lean<{ title: string }[]>(),
      this.resumes.findOne({ userId: owner }, { 'drafts.title': 1 }).lean<{ drafts?: { title: string }[] }>(),
    ]);
    const seen = new Set([...myExperiences, ...(myResume?.drafts ?? [])].map((x) => titleKey(x.title)));

    // AI 응답은 믿지 않는다: 빈 제목과 이미 나온 제목(이번 응답 안 포함)은 서버가 버린다.
    const added: DraftRecord[] = [];
    for (const activity of result.activities) {
      const title = cleanTitle(activity.title);
      if (title === '' || seen.has(titleKey(title))) continue;
      seen.add(titleKey(title));
      added.push({
        _id: new Types.ObjectId(),
        title,
        period: activity.period.trim(),
        summary: cleanSummary(activity.summary),
        origin: 'ai',
      });
    }

    const doc = await this.resumes
      .findOneAndUpdate(
        { userId: owner },
        { $set: { text, updatedAt: new Date() }, $push: { drafts: { $each: added } } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<ResumeRecord>();
    return { resume: toResumeDto(doc), added: added.map(toDraftDto) };
  }

  // 아직 문서가 없으면 만들지 않고 빈 이력서 모양만 돌려준다: 조회만으로 DB에 쓰지 않는다.
  async get(userId: string): Promise<ResumeDto> {
    const doc = await this.resumes.findOne({ userId: new Types.ObjectId(userId) }).lean<ResumeRecord>();
    return toResumeDto(doc);
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

  // 고른 초안을 요청 순서대로 경험으로 만들고 초안 목록에서 뺀다(api.md 4절, 명세 10).
  // 모든 id가 내 문서에 있을 때만 한 번의 조건부 $pull로 빼므로, 하나라도 없거나 남의 것이면 아무것도 바뀌지 않고 404이며
  // 같은 초안을 동시에 두 번 확정해도 한쪽만 성공해 같은 경험이 둘 생기지 않는다.
  async confirmDrafts(userId: string, draftIds: string[]): Promise<ExperienceDto[]> {
    const parsed = draftIds.map(parseObjectIdOr404);
    // 같은 id를 두 번 보내도 경험은 하나만 만든다(처음 나온 자리의 순서를 따른다).
    const oids = parsed.filter((oid, i) => parsed.findIndex((other) => other.equals(oid)) === i);
    const owner = new Types.ObjectId(userId);

    const before = await this.resumes
      .findOneAndUpdate(
        { userId: owner, 'drafts._id': { $all: oids } },
        { $pull: { drafts: { _id: { $in: oids } } } },
        { returnDocument: 'before' },
      )
      .lean<ResumeRecord>();
    if (!before) throw draftNotFound();

    const byId = new Map(before.drafts.map((d) => [String(d._id), d]));
    const picked = oids.map((oid) => byId.get(String(oid))).filter((d): d is DraftRecord => !!d);
    try {
      return await this.experienceCards.createMany(
        userId,
        picked.map((d) => ({ title: d.title, period: d.period ?? '', summary: d.summary ?? '' })),
      );
    } catch (err) {
      // 경험을 만들지 못했으면 뺀 초안을 되돌려 사용자가 고른 활동을 잃지 않고 다시 시도할 수 있게 한다.
      await this.resumes.updateOne({ userId: owner }, { $push: { drafts: { $each: picked } } });
      throw err;
    }
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
