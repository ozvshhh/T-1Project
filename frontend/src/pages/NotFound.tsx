import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없어요</h1>
      <Link to="/" className="text-blue-600 underline">
        홈으로
      </Link>
    </main>
  )
}
