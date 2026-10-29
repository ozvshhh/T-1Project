import { Link } from 'react-router-dom'

// 모든 화면의 공통 상태 세 가지(screen-spec 0절).

// 글자만 두면 흰 화면처럼 보여서, 나올 내용 자리만큼 스켈레톤을 깐다(POLISH S1).
export function Loading({ text = '불러오는 중', rows = 3 }: { text?: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3 py-6">
      <p role="status" className="dots text-[15px]">
        {text}
      </p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="skeleton h-14" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  )
}

export function Empty({ text, to, action }: { text: string; to: string; action: string }) {
  return (
    <div className="row-pending rounded-row flex flex-col items-start gap-4 p-6">
      <p className="text-[15px]">{text}</p>
      <Link to={to} className="btn btn-sm btn-secondary">
        {action}
      </Link>
    </div>
  )
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-row bg-pink flex flex-col items-start gap-4 p-6">
      <p className="text-[15px]">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  )
}

export function PageTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="pt-12 pb-8">
      {eyebrow && <p className="label mb-3">{eyebrow}</p>}
      <h1 className="h2">{title}</h1>
    </div>
  )
}
