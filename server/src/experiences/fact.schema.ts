import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Item, ITEMS } from './experience.schema';

export const FACT_STATUSES = ['candidate', 'confirmed'] as const;
export const FACT_SOURCES = ['said', 'clue', 'ai_unverified'] as const;
// 사용자가 확정할 때 고를 수 있는 출처. ai_unverified는 AI 후보에만 붙고 확정 사실의 출처가 될 수 없다(C1).
export const CONFIRMED_SOURCES = ['said', 'clue'] as const;
export const FACT_ORIGINS = ['conversation', 'check', 'manual'] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];
export type FactSource = (typeof FACT_SOURCES)[number];
export type ConfirmedSource = (typeof CONFIRMED_SOURCES)[number];
export type FactOrigin = (typeof FACT_ORIGINS)[number];

// 사실(api.md 2절 Fact). 경험 카드·후보가 모두 이 컬렉션에서 나온다(명세 05). experienceId 인덱스로 경험 상세를 빠르게 조립한다.
@Schema({ collection: 'facts', timestamps: { createdAt: true, updatedAt: false } })
export class Fact {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  experienceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ITEMS })
  item!: Item;

  @Prop({ type: String, required: true })
  text!: string;

  @Prop({ type: String, required: true, enum: FACT_STATUSES })
  status!: FactStatus;

  @Prop({ type: String, required: true, enum: FACT_SOURCES })
  source!: FactSource;

  @Prop({ type: Types.ObjectId, default: null })
  clueId!: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: FACT_ORIGINS })
  origin!: FactOrigin;

  createdAt!: Date;
}

export type FactDocument = HydratedDocument<Fact>;
export const FactSchema = SchemaFactory.createForClass(Fact);
