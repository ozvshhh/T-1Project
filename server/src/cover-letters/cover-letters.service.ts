import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, UpdateQuery } from 'mongoose';
import { assertOwner, parseObjectIdOr404 } from '../common/ownership';
import { CoverLetterDto, toCoverLetterDto } from './cover-letter.dto';
import { CoverLetter } from './cover-letter.schema';
import {
  COVER_LETTER_REASONS,
  coverLetterValidationError,
  CreateCoverLetterInput,
  UpdateCoverLetterInput,
} from './cover-letter.validation';

type CoverLetterRecord = CoverLetter & { _id: Types.ObjectId };

@Injectable()
export class CoverLettersService {
  constructor(@InjectModel(CoverLetter.name) private readonly coverLetters: Model<CoverLetter>) {}

  // 붙여넣은 자소서는 문항·우대사항이 없다(api.md 7절): items []·target null로 고정한다.
  async createPasted(userId: string, input: CreateCoverLetterInput): Promise<CoverLetterDto> {
    const created = await this.coverLetters.create({
      userId: new Types.ObjectId(userId),
      kind: 'pasted',
      title: input.title,
      body: input.body,
      target: null,
      items: [],
    });
    return toCoverLetterDto(created.toObject());
  }

  // 토큰 사용자의 것만, 최근 수정순(R1·R7). 같은 시각이면 _id로 순서를 고정해 목록이 흔들리지 않게 한다.
  async listByUser(userId: string): Promise<CoverLetterDto[]> {
    const docs = await this.coverLetters
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1, _id: -1 })
      .lean<CoverLetterRecord[]>();
    return docs.map(toCoverLetterDto);
  }

  // 소유자 확인 뒤에만 고친다. 생성한 자소서의 글은 문항 응답이 만드므로 body를 받지 않는다(api.md 7절).
  async update(userId: string, id: string, input: UpdateCoverLetterInput): Promise<CoverLetterDto> {
    const owned = await this.findOwned(userId, id);
    if (owned.kind === 'generated' && input.body !== undefined) {
      throw coverLetterValidationError([{ field: 'body', reason: COVER_LETTER_REASONS.generatedBody }]);
    }
    if (Object.keys(input).length === 0) return toCoverLetterDto(owned);
    return toCoverLetterDto(await this.markChanged(owned, userId, { $set: input }));
  }

  // 자소서를 바꾸는 모든 API(PATCH 자소서·문항 응답 수정·응답 생성)가 이 한 곳으로 저장한다.
  // 명세 08이 여기에 「기존 점검 오래됨」 표시를 붙이므로, 변경 지점이 흩어지면 오래됨 누락이 생긴다.
  private async markChanged(
    owned: CoverLetterRecord,
    userId: string,
    change: UpdateQuery<CoverLetter>,
  ): Promise<CoverLetterRecord> {
    const updated = await this.coverLetters
      .findOneAndUpdate({ _id: owned._id, userId: owned.userId }, change, { returnDocument: 'after' })
      .lean<CoverLetterRecord>();
    return assertOwner(updated, userId);
  }

  // 남의 것·없는 것·잘못된 id 모두 같은 404(R1).
  private async findOwned(userId: string, id: string): Promise<CoverLetterRecord> {
    const doc = await this.coverLetters.findById(parseObjectIdOr404(id)).lean<CoverLetterRecord>();
    return assertOwner(doc, userId);
  }
}
