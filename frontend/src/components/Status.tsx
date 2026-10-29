import type { ReactNode } from 'react'
import { CheckMark } from '@/components/CheckMark'
import { STATUS_INFO, type StatusKind } from '@/lib/status'

/** 상태 글자. 설명됨은 초록 체크가 앞에 붙는다. 상태는 항상 글자로도 적는다. */
export function StatusBadge({ kind }: { kind: StatusKind }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {kind === 'explained' && <CheckMark />}
      {STATUS_INFO[kind].label}
    </span>
  )
}

/** 상태 행: 아직 안 된 것은 점선 행, 된 것은 흰 행(DESIGN.md 5절). */
export function StatusRow({
  kind,
  children,
  className = '',
}: {
  kind: StatusKind
  children?: ReactNode
  className?: string
}) {
  const dashed = STATUS_INFO[kind].dashed
  return (
    <div className={`row ${dashed ? 'row-pending' : ''} items-center ${className}`}>
      <span>{children}</span>
      <StatusBadge kind={kind} />
    </div>
  )
}
