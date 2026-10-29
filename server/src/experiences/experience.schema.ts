import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// 경험 항목 다섯 개(api.md 2절 Item). 카드·상태가 모두 이 순서·이름을 쓴다.
export const ITEMS = ['situation', 'role', 'action', 'result', 'meaning'] as const;
export type Item = (typeof ITEMS)[number];

export const ITEM_STATUSES = ['explained', 'needs_more', 'unknown'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number] | null;

// 처음에는 다섯 항목 모두 "아직 묻지 않음"(null)이다. 매번 새 객체를 만들어 문서끼리 공유하지 않는다.
function initialItemStatus(): Record<Item, ItemStatus> {
  return Object.fromEntries(ITEMS.map((item) => [item, null])) as Record<Item, ItemStatus>;
}

// userId 인덱스로 "내 경험 목록"을 계정별로 빠르게 고른다(R1). updatedAt은 목록 정렬 기준(R6).
@Schema({ collection: 'experiences', timestamps: true })
export class Experience {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  period!: string;

  @Prop({
    type: Object.fromEntries(
      ITEMS.map((item) => [item, { type: String, enum: [...ITEM_STATUSES, null], default: null }]),
    ),
    default: initialItemStatus,
    _id: false,
  })
  itemStatus!: Record<Item, ItemStatus>;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ExperienceDocument = HydratedDocument<Experience>;
export const ExperienceSchema = SchemaFactory.createForClass(Experience);
