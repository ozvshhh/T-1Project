import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import { Empty, ErrorView, Loading, PageTitle } from '@/components/States'
import { END_REASON_LABEL, formatDate } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'

export default function Interviews() {
  const { data, error, loading, reload } = useLoad(() =>
    api.listInterviews().then((r) => r.interviews),
  )

  return (
    <main className="wrap">
      <PageTitle eyebrow="03 음성 모의면접" title="면접 기록" />
      {loading && <Loading />}
      {error && <ErrorView message={error.message} onRetry={reload} />}
      {data?.length === 0 && (
        <Empty
          text="아직 본 면접이 없어요. 모의면접을 시작해 보세요."
          to="/interview"
          action="모의면접으로"
        />
      )}
      {data && data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.map((iv) => {
            const ongoing = iv.status === 'in_progress'
            return (
              <li key={iv.id}>
                <Link
                  to={ongoing ? `/interviews/${iv.id}` : `/interviews/${iv.id}/result`}
                  className={`row border-ink items-center gap-4 border px-5 py-4 ${ongoing ? 'bg-cream' : ''}`}
                >
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold">{iv.coverLetterTitle}</span>
                    <span className="text-[13px]">{formatDate(iv.startedAt)}</span>
                  </span>
                  <span className="shrink-0 text-[15px]">
                    {ongoing
                      ? '이어서 하기'
                      : iv.endReason
                        ? END_REASON_LABEL[iv.endReason]
                        : '종료'}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
