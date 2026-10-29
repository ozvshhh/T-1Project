import type { ReactNode } from 'react'

// 단계 색: 경험 = lime, 자소서 = lilac, 점검 = cream(specs/00-common.md).
const STAGE_BG = {
  experience: 'bg-lime',
  coverLetter: 'bg-lilac',
  check: 'bg-cream',
} as const

export type Stage = keyof typeof STAGE_BG

export function StageBlock({
  stage,
  children,
  className = '',
}: {
  stage: Stage
  children: ReactNode
  className?: string
}) {
  return <section className={`block-card ${STAGE_BG[stage]} ${className}`}>{children}</section>
}
