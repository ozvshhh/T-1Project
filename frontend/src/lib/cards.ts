import type { Experience, Item } from '@/api/types'

export const ITEM_LABELS: Record<Item, string> = {
  situation: '상황',
  role: '역할',
  action: '행동',
  result: '결과',
  meaning: '의의',
}

export const ITEM_ORDER: Item[] = ['situation', 'role', 'action', 'result', 'meaning']

/** 경험 카드에 확정 사실이 1개 이상 있는지. */
export function hasConfirmedFact(experience: Experience): boolean {
  return ITEM_ORDER.some((item) => experience.card[item].length > 0)
}

/** 자소서 잠금이 풀렸는지: 확정 사실이 있는 경험이 하나라도 있어야 한다(specs/00-common.md). */
export function isUnlocked(experiences: Experience[]): boolean {
  return experiences.some(hasConfirmedFact)
}
