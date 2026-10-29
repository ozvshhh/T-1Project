import { Link } from 'react-router-dom'

// 모든 화면의 공통 상태 세 가지(screen-spec 0절).

export function Loading({ text = '불러오는 중' }: { text?: string }) {
  return (
    <p role="status" className="py-10 text-[15px]">
      {text}
    </p>
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
