import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { assertOwner, parseObjectIdOr404 } from '../common/ownership';
import { CoverLetter } from '../cover-letters/cover-letter.schema';
import { CheckDto, toCheckDto } from './check.dto';
import { Check, INITIAL_FOLLOW_UPS } from './check.schema';
import { buildSentencesInput, SENTENCES_SYSTEM, sentencesSchema } from './prompts';

type CoverLetterRecord = CoverLetter & { _id: Types.ObjectId };
type CheckRecord = Check & { _id: Types.ObjectId };

@Injectable()
export class ChecksService {
  constructor(
    @InjectModel(Check.name) private readonly checks: Model<Check>,
    @InjectModel(CoverLetter.name) private readonly coverLetters: Model<CoverLetter>,
    private readonly ai: AiService,
  ) {}

  // 점검 만들기(R9). AI가 고른 문장은 믿지 않는다: 원문에 그대로 든 문장만 남기고, 문항 id는 서버가 다시 맞춘다.
  // AI 성공 뒤에만 저장해 실패하면 점검이 하나도 생기지 않는다(C2). 자소서는 읽기만 한다(C4).
  async create(userId: string, coverLetterId: string): Promise<CheckDto> {
    const owned = await this.findCoverLetter(userId, coverLetterId);
    const items = (owned.items ?? [])
      .filter((item) => item.answer !== null && item.answer !== undefined)
      .map((item) => ({ id: String(item._id), oid: item._id, answer: item.answer as string }));

    const result = await this.ai.json({
      task: 'check-sentences',
      system: SENTENCES_SYSTEM,
      user: buildSentencesInput(
        owned.kind === 'pasted'
          ? { kind: 'pasted', body: owned.body ?? '' }
          : { kind: 'generated', items: items.map(({ id, answer }) => ({ id, answer })) },
      ),
      schema: sentencesSchema,
    });

    const seen = new Set<string>();
    const sentences: { text: string; coverLetterItemId: Types.ObjectId | null }[] = [];
    for (const picked of result.sentences) {
      const text = picked.text.trim();
      if (!text) continue;
      let itemOid: Types.ObjectId | null = null;
      if (owned.kind === 'pasted') {
        if (!(owned.body ?? '').includes(text)) continue;
      } else {
        // AI가 고른 문항이 실제로 문장을 담고 있으면 그대로, 아니면 문장이 든 첫 문항으로 바로잡는다. 어디에도 없으면 버린다.
        const containing = items.filter((item) => item.answer.includes(text));
        const match = containing.find((item) => item.id === picked.coverLetterItemId) ?? containing[0];
        if (!match) continue;
        itemOid = match.oid;
      }
      const key = `${String(itemOid)}\u0000${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sentences.push({ text, coverLetterItemId: itemOid });
    }

    const created = await this.checks.create({
      userId: owned.userId,
      coverLetterId: owned._id,
      stale: false,
      sentences: sentences.map((s) => ({ ...s, status: 'pending', turns: [], followUpsLeft: INITIAL_FOLLOW_UPS })),
      candidates: [],
    });
    return toCheckDto(created.toObject());
  }

  // 남의 점검·없는 점검·잘못된 id 모두 같은 404(R1).
  async get(userId: string, checkId: string): Promise<CheckDto> {
    const doc = await this.checks.findById(parseObjectIdOr404(checkId)).lean<CheckRecord>();
    return toCheckDto(assertOwner(doc, userId));
  }

  // 자소서 소유 확인 뒤 그 자소서의 점검만 최신순(R11). 같은 시각이면 _id로 순서를 고정한다.
  async listByCoverLetter(userId: string, coverLetterId: string): Promise<CheckDto[]> {
    const owned = await this.findCoverLetter(userId, coverLetterId);
    const docs = await this.checks
      .find({ coverLetterId: owned._id, userId: owned.userId })
      .sort({ createdAt: -1, _id: -1 })
      .lean<CheckRecord[]>();
    return docs.map(toCheckDto);
  }

  // 남의 자소서·없는 자소서·잘못된 id 모두 같은 404(R1). AI를 부르기 전에 막아 남의 자소서로 비용이 들지 않게 한다.
  private async findCoverLetter(userId: string, id: string): Promise<CoverLetterRecord> {
    const doc = await this.coverLetters.findById(parseObjectIdOr404(id)).lean<CoverLetterRecord>();
    return assertOwner(doc, userId);
  }
}
