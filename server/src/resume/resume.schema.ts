import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const DRAFT_ORIGINS = ['ai', 'manual'] as const;
export type DraftOrigin = (typeof DRAFT_ORIGINS)[number];

// 이력서 안의 활동 초안(api.md 2절 ActivityDraft). 각자 _id가 있어 경로의 :draftId로 하나씩 고치고 지운다.
@Schema({ _id: true })
export class ActivityDraft {
  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, default: '' })
  period!: string;

  @Prop({ type: String, default: '' })
  summary!: string;

  @Prop({ type: String, required: true, enum: DRAFT_ORIGINS })
  origin!: DraftOrigin;
}

export const ActivityDraftSchema = SchemaFactory.createForClass(ActivityDraft);

// 계정당 이력서 하나(R2): userId unique로 같은 계정에 문서가 둘 생기지 않게 한다.
// updatedAt은 붙여넣은 글 기준이라 아직 없으면 null이어야 해서 mongoose timestamps를 쓰지 않는다.
@Schema({ collection: 'resumes' })
export class Resume {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, default: null })
  text!: string | null;

  @Prop({ type: [ActivityDraftSchema], default: [] })
  drafts!: (ActivityDraft & { _id: Types.ObjectId })[];

  @Prop({ type: Date, default: null })
  updatedAt!: Date | null;
}

export type ResumeDocument = HydratedDocument<Resume>;
export const ResumeSchema = SchemaFactory.createForClass(Resume);
