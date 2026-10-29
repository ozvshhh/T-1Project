import type { ItemStatus, SentenceStatus } from '@/api/types'

// 상태 값 → 화면 글자·모양(specs/00-common.md 「상태 표시」).
export type StatusKind =
  | 'explained'
  | 'needs_more'
  | 'unknown'
  | 'unasked'
  | 'pending'
  | 'in_progress'
  | 'ai_unverified'
  | 'said'
  | 'clue'

export const STATUS_INFO: Record<StatusKind, { label: string; dashed: boolean }> = {
  explained: { label: '설명됨', dashed: false },
  needs_more: { label: '추가 확인 필요', dashed: true },
  unknown: { label: '모름·경험 없음', dashed: true },
  unasked: { label: '아직 묻지 않음', dashed: true },
  pending: { label: '대기', dashed: true },
  in_progress: { label: '진행 중', dashed: true },
  ai_unverified: { label: 'AI 제안·미확인', dashed: true },
  said: { label: '내가 말함', dashed: false },
  clue: { label: '자료로 확인', dashed: false },
}

/** 경험 항목 상태(null = 아직 묻지 않음)와 점검 문장 상태를 화면 종류로 바꾼다. */
export function statusKind(status: ItemStatus | SentenceStatus): StatusKind {
  return status ?? 'unasked'
}
