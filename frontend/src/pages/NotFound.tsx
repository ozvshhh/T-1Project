import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="wrap pt-16">
      <div className="block-card bg-cream min-h-[320px] justify-between">
        <p className="label">404</p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="h2">없는 페이지예요</h1>
          <Link to="/" className="btn btn-secondary">
            홈으로
          </Link>
        </div>
      </div>
    </main>
  )
}
