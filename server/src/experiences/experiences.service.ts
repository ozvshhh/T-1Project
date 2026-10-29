import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { assertOwner, parseObjectIdOr404 } from '../common/ownership';
import { ExperienceDto, ExperienceRelated, toExperienceDto } from './experience.dto';
import { Experience } from './experience.schema';
import { ExperienceInput } from './experience.validation';

type ExperienceRecord = Experience & { _id: Types.ObjectId };

@Injectable()
export class ExperiencesService {
  constructor(@InjectModel(Experience.name) private readonly experiences: Model<Experience>) {}

  async create(userId: string, input: ExperienceInput): Promise<ExperienceDto> {
    const created = await this.experiences.create({
      userId: new Types.ObjectId(userId),
      title: input.title,
      period: input.period,
    });
    return this.assemble(created.toObject());
  }

  // 토큰 사용자의 것만, 최근 수정순(R1·R6). 같은 시각이면 _id로 순서를 고정해 목록이 흔들리지 않게 한다.
  async listByUser(userId: string): Promise<ExperienceDto[]> {
    const docs = await this.experiences
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1, _id: -1 })
      .lean<ExperienceRecord[]>();
    return Promise.all(docs.map((doc) => this.assemble(doc)));
  }

  async get(userId: string, id: string): Promise<ExperienceDto> {
    return this.assemble(await this.findOwned(userId, id));
  }

  // 소유자 확인 뒤에만 고친다. 고친 칸이 없으면 updatedAt도 그대로 둬 목록 순서를 흔들지 않는다.
  async update(userId: string, id: string, input: Partial<ExperienceInput>): Promise<ExperienceDto> {
    const owned = await this.findOwned(userId, id);
    if (Object.keys(input).length === 0) return this.assemble(owned);
    const updated = await this.experiences
      .findOneAndUpdate({ _id: owned._id, userId: owned.userId }, { $set: input }, { returnDocument: 'after' })
      .lean<ExperienceRecord>();
    return this.assemble(assertOwner(updated, userId));
  }

  // 잘못된 id 형식·없는 id·남의 경험을 모두 같은 404로 돌려 존재 여부가 새지 않게 한다(R1).
  private async findOwned(userId: string, id: string): Promise<ExperienceRecord> {
    const objectId = parseObjectIdOr404(id);
    const doc = await this.experiences.findById(objectId).lean<ExperienceRecord>();
    return assertOwner(doc, userId);
  }

  // 단서·사실 컬렉션은 C5-2·C5-3에서 생긴다. 그 전까지 이 경험에 딸린 단서·사실은 실제로 없으므로 빈 목록으로 조립한다.
  private assemble(doc: ExperienceRecord): Promise<ExperienceDto> {
    const related: ExperienceRelated = { clues: [], facts: [] };
    return Promise.resolve(toExperienceDto(doc, related));
  }
}
