import { Clue } from './clue.schema';
import { Experience, Item, ItemStatus, ITEMS } from './experience.schema';

// api.md 2절 Fact·Clue 응답 모양. 단서·사실 컬렉션(C5-2·C5-3)이 이 모양으로 조립해 넘긴다.
export interface FactDto {
  id: string;
  item: Item;
  text: string;
  status: 'candidate' | 'confirmed';
  source: 'said' | 'clue' | 'ai_unverified';
  clueId: string | null;
  origin: 'conversation' | 'check' | 'manual';
  createdAt: string;
}

export interface ClueDto {
  id: string;
  type: 'photo' | 'award' | 'document' | 'text';
  description: string | null;
  text: string | null;
  fileName: string | null;
  createdAt: string;
}

export interface ExperienceDto {
  id: string;
  title: string;
  period: string;
  clues: ClueDto[];
  itemStatus: Record<Item, ItemStatus>;
  card: Record<Item, FactDto[]>;
  candidates: FactDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceRelated {
  clues: ClueDto[];
  facts: FactDto[];
}

type ExperienceRecord = Experience & { _id: unknown };

type ClueRecord = Pick<Clue, 'type' | 'description' | 'text' | 'fileName' | 'createdAt'> & { _id: unknown };

// 단서 응답은 api.md 2절 키만 고른다: 바이트·userId·mimeType·size가 응답에 실리면 안 된다.
export function toClueDto(clue: ClueRecord): ClueDto {
  return {
    id: String(clue._id),
    type: clue.type,
    description: clue.description ?? null,
    text: clue.text ?? null,
    fileName: clue.fileName ?? null,
    createdAt: clue.createdAt.toISOString(),
  };
}

// 응답에 userId·_id·__v가 새지 않도록 키를 하나씩 골라 조립한다.
// card에는 확정된 사실만, candidates에는 후보만 넣는다(R4·R6·C1): 후보가 카드에 섞이면 검증 안 된 문장이 자소서 근거가 된다.
export function toExperienceDto(exp: ExperienceRecord, related: ExperienceRelated): ExperienceDto {
  const card = Object.fromEntries(ITEMS.map((item) => [item, [] as FactDto[]])) as Record<
    Item,
    FactDto[]
  >;
  const candidates: FactDto[] = [];
  for (const fact of related.facts) {
    if (fact.status === 'confirmed') card[fact.item].push(fact);
    else candidates.push(fact);
  }
  return {
    id: String(exp._id),
    title: exp.title,
    period: exp.period,
    clues: related.clues,
    itemStatus: Object.fromEntries(
      ITEMS.map((item) => [item, exp.itemStatus?.[item] ?? null]),
    ) as Record<Item, ItemStatus>,
    card,
    candidates,
    createdAt: exp.createdAt.toISOString(),
    updatedAt: exp.updatedAt.toISOString(),
  };
}
