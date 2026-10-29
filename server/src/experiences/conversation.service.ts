import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { assertOwner, parseObjectIdOr404 } from '../common/ownership';
import { Clue } from './clue.schema';
import { FactDto, toFactDto } from './experience.dto';
import { Experience, Item, ItemStatus, ITEMS } from './experience.schema';
import { Fact } from './fact.schema';
import { Message } from './message.schema';
import { buildConversationInput, CONVERSATION_SYSTEM, conversationStartSchema } from './prompts';

type ExperienceRecord = Experience & { _id: Types.ObjectId };
type MessageRecord = Message & { _id: Types.ObjectId };
type FactRecord = Fact & { _id: Types.ObjectId };

// api.md 2절 Message 모양. experienceId·userId·_id는 응답에 싣지 않는다.
export interface MessageDto {
  role: 'ai' | 'user';
  text: string;
  createdAt: string;
}

export interface ConversationDto {
  messages: MessageDto[];
  itemStatus: Record<Item, ItemStatus>;
  candidates: FactDto[];
}

export interface ConversationStartDto {
  question: MessageDto;
  itemStatus: Record<Item, ItemStatus>;
}

function toMessageDto(message: MessageRecord): MessageDto {
  return { role: message.role, text: message.text, createdAt: message.createdAt.toISOString() };
}

function itemStatusOf(exp: ExperienceRecord): Record<Item, ItemStatus> {
  return Object.fromEntries(ITEMS.map((item) => [item, exp.itemStatus?.[item] ?? null])) as Record<
    Item,
    ItemStatus
  >;
}

// 경험 대화(api.md 5절, 명세 06). AI 호출이 성공한 뒤에만 저장해 실패한 요청이 흔적을 남기지 않게 한다(C2).
@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Experience.name) private readonly experiences: Model<Experience>,
    @InjectModel(Clue.name) private readonly clues: Model<Clue>,
    @InjectModel(Fact.name) private readonly facts: Model<Fact>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    private readonly ai: AiService,
  ) {}

  async get(userId: string, id: string): Promise<ConversationDto> {
    const owned = await this.findOwned(userId, id);
    const [messages, candidates] = await Promise.all([
      this.listMessages(owned),
      this.facts
        .find({ experienceId: owned._id, status: 'candidate' })
        .sort({ createdAt: 1, _id: 1 })
        .lean<FactRecord[]>(),
    ]);
    return {
      messages: messages.map(toMessageDto),
      itemStatus: itemStatusOf(owned),
      candidates: candidates.map(toFactDto),
    };
  }

  // 이미 대화가 있으면 AI를 다시 부르지 않고 마지막 AI 질문을 돌려준다: 다시 들어올 때마다 비용이 들고 질문이 겹치면 안 된다(api.md 5절).
  async start(userId: string, id: string): Promise<ConversationStartDto> {
    const owned = await this.findOwned(userId, id);
    const lastAi = await this.messages
      .findOne({ experienceId: owned._id, role: 'ai' })
      .sort({ createdAt: -1, _id: -1 })
      .lean<MessageRecord>();
    if (lastAi) return { question: toMessageDto(lastAi), itemStatus: itemStatusOf(owned) };

    const clues = await this.clues
      .find({ experienceId: owned._id })
      .select('type description text')
      .sort({ createdAt: 1, _id: 1 })
      .lean<Pick<Clue, 'type' | 'description' | 'text'>[]>();
    const result = await this.ai.json({
      task: 'conversation-start',
      system: CONVERSATION_SYSTEM,
      user: buildConversationInput({
        title: owned.title,
        period: owned.period,
        clues,
        messages: [],
        itemStatus: itemStatusOf(owned),
      }),
      schema: conversationStartSchema,
    });

    // 여기부터는 AI 성공 뒤라 저장해도 된다. 상태 값은 스키마를 통과한 다섯 항목만 쓴다(AI 응답은 믿지 않는다).
    const itemStatus = Object.fromEntries(ITEMS.map((item) => [item, result.itemStatus[item]])) as Record<
      Item,
      ItemStatus
    >;
    const created = await this.messages.create({
      experienceId: owned._id,
      userId: owned.userId,
      role: 'ai',
      text: result.question.trim(),
    });
    await this.experiences.updateOne({ _id: owned._id }, { $set: { itemStatus, updatedAt: new Date() } });
    return { question: toMessageDto(created.toObject()), itemStatus };
  }

  private listMessages(owned: ExperienceRecord): Promise<MessageRecord[]> {
    return this.messages
      .find({ experienceId: owned._id })
      .sort({ createdAt: 1, _id: 1 })
      .lean<MessageRecord[]>();
  }

  // 잘못된 id 형식·없는 id·남의 경험을 모두 같은 404로 돌려 존재 여부가 새지 않게 한다(R1).
  private async findOwned(userId: string, id: string): Promise<ExperienceRecord> {
    const objectId = parseObjectIdOr404(id);
    const doc = await this.experiences.findById(objectId).lean<ExperienceRecord>();
    return assertOwner(doc, userId);
  }
}
