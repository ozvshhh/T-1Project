import { ConflictException, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { assertOwner, parseObjectIdOr404 } from '../common/ownership';
import { CoverLetter } from '../cover-letters/cover-letter.schema';
import { CheckDto, CheckSentenceDto, toCheckDto, toSentenceDto } from './check.dto';
import { Check, INITIAL_FOLLOW_UPS } from './check.schema';
import {
  buildQuestionInput,
  buildSentencesInput,
  QUESTION_SYSTEM,
  questionSchema,
  SENTENCES_SYSTEM,
  sentencesSchema,
} from './prompts';

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

  // 문장 첫 질문(R10). 이미 시작한 문장은 AI 비용 없이 지금 상태를 그대로 돌려준다(api.md 9절).
  // AI 성공 뒤에만 turn·상태를 저장해 실패하면 문장이 pending 그대로 남는다(C2).
  async start(userId: string, checkId: string, sentenceId: string): Promise<CheckSentenceDto> {
    const check = await this.findActive(userId, checkId);
    const sentence = this.findSentence(check, sentenceId);
    if (sentence.status !== 'pending') return toSentenceDto(sentence);

    const owned = await this.findCoverLetter(userId, String(check.coverLetterId));
    const itemOid = sentence.coverLetterItemId;
    const item = itemOid ? (owned.items ?? []).find((i) => i._id.equals(itemOid)) : undefined;
    const result = await this.ai.json({
      task: 'check-question',
      system: QUESTION_SYSTEM,
      user: buildQuestionInput({
        sentence: sentence.text,
        context: item ? { question: item.question, text: item.answer ?? '' } : { text: owned.body ?? '' },
      }),
      schema: questionSchema,
    });

    // pending 조건을 걸어 동시에 두 번 시작해도 첫 질문이 두 개 붙지 않게 한다. AI 사이에 오래됨이 되면 저장하지 않는다.
    const updated = await this.checks
      .findOneAndUpdate(
        { _id: check._id, stale: false, sentences: { $elemMatch: { _id: sentence._id, status: 'pending' } } },
        {
          $set: { 'sentences.$.status': 'in_progress' },
          $push: { 'sentences.$.turns': { question: result.question, answer: null, judge: [] } },
        },
        { returnDocument: 'after' },
      )
      .lean<CheckRecord>();
    if (updated) return toSentenceDto(this.findSentence(updated, sentenceId));
    // 다른 요청이 먼저 시작했거나 그사이 오래됨이 됐다: 다시 읽어 같은 규칙(409·지금 상태)으로 답한다.
    const current = await this.findActive(userId, checkId);
    return toSentenceDto(this.findSentence(current, sentenceId));
  }

  // 답하기(R10·R11). 오래된 점검이면 판정·AI보다 먼저 409로 막는다(오래된 점검은 볼 수만 있다, 학생 답 2026-10-30).
  // 판정·상태 결정(①~④)은 명세 08 C8-3 주장이 이 자리에 붙인다. 그 전에는 AI를 부르지 않고 501로 알린다.
  async answer(userId: string, checkId: string, sentenceId: string): Promise<never> {
    const check = await this.findActive(userId, checkId);
    this.findSentence(check, sentenceId);
    throw new NotImplementedException({ code: 'NOT_IMPLEMENTED', message: '답 판정은 아직 준비 중이에요.' });
  }

  // 소유 확인(404) 뒤 오래된 점검이면 409 CHECK_STALE. 자소서가 바뀐 뒤의 점검으로 이어 가면 지금 글과 다른 문장을 해명하게 된다.
  private async findActive(userId: string, checkId: string): Promise<CheckRecord> {
    const doc = await this.checks.findById(parseObjectIdOr404(checkId)).lean<CheckRecord>();
    const check = assertOwner(doc, userId);
    if (check.stale) {
      throw new ConflictException({
        code: 'CHECK_STALE',
        message: '점검을 만든 뒤 자기소개서가 바뀌었어요. 새 점검을 만들어 주세요.',
      });
    }
    return check;
  }

  // 없는 문장·잘못된 id는 남의 자원과 같은 404 본문(R1).
  private findSentence(check: CheckRecord, sentenceId: string): CheckRecord['sentences'][number] {
    const oid = parseObjectIdOr404(sentenceId);
    const sentence = (check.sentences ?? []).find((s) => s._id.equals(oid));
    if (!sentence) throw new NotFoundException({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' });
    return sentence;
  }

  // 남의 자소서·없는 자소서·잘못된 id 모두 같은 404(R1). AI를 부르기 전에 막아 남의 자소서로 비용이 들지 않게 한다.
  private async findCoverLetter(userId: string, id: string): Promise<CoverLetterRecord> {
    const doc = await this.coverLetters.findById(parseObjectIdOr404(id)).lean<CoverLetterRecord>();
    return assertOwner(doc, userId);
  }
}
