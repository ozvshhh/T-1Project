import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const FILE_CLUE_TYPES = ['photo', 'award', 'document'] as const;
export const CLUE_TYPES = [...FILE_CLUE_TYPES, 'text'] as const;
export type FileClueType = (typeof FILE_CLUE_TYPES)[number];
export type ClueType = (typeof CLUE_TYPES)[number];

// 단서(R2). 배포 컨테이너에는 영구 디스크가 없으므로 파일 바이트도 이 문서의 data에 담아 Mongo에 둔다(명세 05).
// experienceId 인덱스로 경험 상세를 그릴 때 단서를 빠르게 모은다.
@Schema({ collection: 'clues', timestamps: true })
export class Clue {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  experienceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: CLUE_TYPES })
  type!: ClueType;

  @Prop({ type: String, default: null })
  description!: string | null;

  @Prop({ type: String, default: null })
  text!: string | null;

  @Prop({ type: String, default: null })
  fileName!: string | null;

  @Prop({ type: String, default: null })
  mimeType!: string | null;

  @Prop({ type: Number, default: null })
  size!: number | null;

  @Prop({ type: Buffer, default: null })
  data!: Buffer | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ClueDocument = HydratedDocument<Clue>;
export const ClueSchema = SchemaFactory.createForClass(Clue);
