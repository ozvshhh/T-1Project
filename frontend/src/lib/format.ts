import type { CoverLetterSource, EndReason } from '@/api/types'

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const SOURCE_LABEL: Record<CoverLetterSource, string> = {
  generated: '생성',
  uploaded: '등록',
}

// 화면 글자는 docs/develope/screen-spec.md 7절 그대로.
export const END_REASON_LABEL: Record<EndReason, string> = {
  user_end: '사용자 종료',
  question_limit: '질문 한도',
  time_limit: '시간 한도',
  all_done: '모두 완료',
}
