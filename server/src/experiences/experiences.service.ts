import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { assertOwner, parseObjectIdOr404 } from '../common/ownership';
import { Clue } from './clue.schema';
import { FileClueInput, TextClueInput } from './clue.validation';
import { ClueDto, ExperienceDto, ExperienceRelated, toClueDto, toExperienceDto } from './experience.dto';
import { Experience } from './experience.schema';
import { ExperienceInput } from './experience.validation';

type ExperienceRecord = Experience & { _id: Types.ObjectId };
type ClueRecord = Clue & { _id: Types.ObjectId };

export interface ClueFile {
  data: Buffer;
  mimeType: string;
  fileName: string;
}

// 경험 상세·목록에 실을 단서 칸. 바이트(data)는 빼서 목록 조회가 파일 크기만큼 무거워지지 않게 한다.
const CLUE_LIST_FIELDS = '_id type description text fileName createdAt';

@Injectable()
export class ExperiencesService {
  constructor(
    @InjectModel(Experience.name) private readonly experiences: Model<Experience>,
    @InjectModel(Clue.name) private readonly clues: Model<Clue>,
  ) {}

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

  // 남의 경험에는 단서를 붙이지 않는다(404). 단서가 생기면 경험 updatedAt을 올려 목록 맨 앞으로 온다(R6).
  async addClue(userId: string, id: string, input: TextClueInput | FileClueInput): Promise<ClueDto> {
    const owned = await this.findOwned(userId, id);
    const fields =
      input.type === 'text'
        ? { type: input.type, text: input.text }
        : {
            type: input.type,
            description: input.description,
            fileName: input.fileName,
            mimeType: input.mimeType,
            size: input.size,
            data: input.data,
          };
    const created = await this.clues.create({ experienceId: owned._id, userId: owned.userId, ...fields });
    await this.experiences.updateOne({ _id: owned._id }, { $set: { updatedAt: new Date() } });
    return toClueDto(created.toObject());
  }

  // 경험 소유·이 경험의 단서·파일 단서인지를 모두 맞춰 본다. 하나라도 어긋나면 같은 404라 남의 파일이 있는지 알 수 없다(R1).
  async getClueFile(userId: string, id: string, clueId: string): Promise<ClueFile> {
    const owned = await this.findOwned(userId, id);
    const clueObjectId = parseObjectIdOr404(clueId);
    const clue = await this.clues
      .findOne({ _id: clueObjectId, experienceId: owned._id, userId: owned.userId })
      .lean<ClueRecord>();
    if (!clue || clue.type === 'text' || !clue.data || clue.fileName === null) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' });
    }
    return {
      data: toBuffer(clue.data),
      mimeType: clue.mimeType || 'application/octet-stream',
      fileName: clue.fileName,
    };
  }

  // 잘못된 id 형식·없는 id·남의 경험을 모두 같은 404로 돌려 존재 여부가 새지 않게 한다(R1).
  private async findOwned(userId: string, id: string): Promise<ExperienceRecord> {
    const objectId = parseObjectIdOr404(id);
    const doc = await this.experiences.findById(objectId).lean<ExperienceRecord>();
    return assertOwner(doc, userId);
  }

  // 사실 컬렉션은 C5-3에서 생긴다. 그 전까지 이 경험에 딸린 사실은 실제로 없으므로 빈 목록으로 조립한다.
  // 단서는 올린 순서대로 보여 줘야 사용자가 방금 올린 것을 끝에서 찾는다.
  private async assemble(doc: ExperienceRecord): Promise<ExperienceDto> {
    const clues = await this.clues
      .find({ experienceId: doc._id })
      .select(CLUE_LIST_FIELDS)
      .sort({ createdAt: 1, _id: 1 })
      .lean<ClueRecord[]>();
    const related: ExperienceRelated = { clues: clues.map(toClueDto), facts: [] };
    return toExperienceDto(doc, related);
  }
}

// lean 조회는 Buffer 대신 BSON Binary를 줄 수 있다. 올린 바이트를 그대로 돌려주려면 실제 Buffer로 바꿔야 한다.
function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  const bin = data as { buffer: Uint8Array };
  return Buffer.from(bin.buffer.buffer, bin.buffer.byteOffset, bin.buffer.byteLength);
}
