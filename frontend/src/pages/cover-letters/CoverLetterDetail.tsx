import { Link, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import { ErrorView, Loading } from '@/components/States'
import { formatDate, SOURCE_LABEL } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'
import NotFound from '@/pages/NotFound'

export default function CoverLetterDetail() {
  const { id = '' } = useParams()
  const { data, error, loading, reload } = useLoad(
    () => api.getCoverLetter(id).then((r) => r.coverLetter),
    [id],
  )

  if (error?.code === 'NOT_FOUND') return <NotFound />

  return (
    <main className="wrap max-w-[960px] pt-12">
      <Link to={`/cover-letters?id=${id}`} className="text-[15px] underline underline-offset-4">
        목록으로
      </Link>
      {loading && <Loading />}
      {error && <ErrorView message={error.message} onRetry={reload} />}
      {data && (
        <article className="mt-6">
          <p className="label">
            {SOURCE_LABEL[data.source]} · {formatDate(data.createdAt)}
          </p>
          <h1 className="h2 mt-3">{data.title}</h1>
          <p className="mt-10 text-[17px] leading-[1.8] whitespace-pre-wrap">{data.body}</p>
          <div className="rounded-block bg-cream mt-12 flex flex-wrap items-center justify-between gap-4 p-7">
            <p className="card-title">이 자기소개서로 모의면접을 볼 수 있어요</p>
            <Link to={`/interview?coverLetterId=${data.id}`} className="btn btn-secondary">
              이 자기소개서로 면접 보기
            </Link>
          </div>
        </article>
      )}
    </main>
  )
}
