import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { CoverLetter } from '@/api/types'
import { ErrorView, Loading, PageTitle } from '@/components/States'
import { formatDate, SOURCE_LABEL } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'

export default function CoverLetters() {
  const [params, setParams] = useSearchParams()
  const list = useLoad(() => api.listCoverLetters().then((r) => r.coverLetters))
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<ApiError | null>(null)

  const items = list.data ?? []
  const selectedId = params.get('id') ?? items[0]?.id ?? null
  const select = (id: string) => setParams({ id }, { replace: true })

  async function onGenerate() {
    setGenerating(true)
    setGenError(null)
    try {
      const { coverLetter } = await api.generateCoverLetter()
      const { id, title, source, createdAt, updatedAt } = coverLetter
      list.setData([{ id, title, source, createdAt, updatedAt }, ...items])
      select(id)
    } catch (err) {
      setGenError(
        err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', '초안을 만들지 못했어요.'),
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <main className="wrap">
      <PageTitle eyebrow="02 자기소개서" title="내 자기소개서" />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onGenerate}
          disabled={generating}
        >
          이력서로 초안 만들기
        </button>
        <Link to="/cover-letters/new" className="btn btn-secondary">
          자기소개서 등록
        </Link>
        {generating && (
          <p role="status" className="text-[15px]">
            초안을 만들고 있어요
          </p>
        )}
      </div>

      {genError && (
        <div
          role="alert"
          className="rounded-row bg-pink mb-6 flex flex-wrap items-center gap-4 p-6"
        >
          <p className="text-[15px]">
            {genError.code === 'AI_UNAVAILABLE'
              ? `초안을 만들지 못했어요. ${genError.message}`
              : genError.message}
          </p>
          {genError.code === 'VALIDATION' && (
            <Link to="/resume" className="btn btn-sm btn-secondary">
              내 이력서 채우기
            </Link>
          )}
        </div>
      )}

      {list.loading && <Loading />}
      {list.error && <ErrorView message={list.error.message} onRetry={list.reload} />}
      {list.data && items.length === 0 && (
        <p className="row-pending rounded-row p-6 text-[15px]">
          아직 자기소개서가 없어요. 이력서로 초안을 만들거나 이미 쓴 글을 등록하세요.
        </p>
      )}

      {items.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[360px_1fr]">
          <section aria-label="자기소개서 목록" className="block-card bg-lilac gap-3">
            <p className="label">목록 {items.length}개</p>
            <ul className="flex flex-col gap-2">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => select(c.id)}
                    aria-current={c.id === selectedId}
                    className={`row w-full cursor-pointer flex-col items-start gap-1 text-left ${
                      c.id === selectedId ? 'outline-ink outline-2 -outline-offset-2' : ''
                    }`}
                  >
                    <span className="font-semibold">{c.title}</span>
                    <span className="text-[13px]">
                      {SOURCE_LABEL[c.source]} · {formatDate(c.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {selectedId && <Preview id={selectedId} />}
        </div>
      )}
    </main>
  )
}

function Preview({ id }: { id: string }) {
  const [state, setState] = useState<{ data?: CoverLetter; error?: ApiError }>({})

  useEffect(() => {
    let alive = true
    setState({})
    api
      .getCoverLetter(id)
      .then((r) => alive && setState({ data: r.coverLetter }))
      .catch((e) => alive && setState({ error: e as ApiError }))
    return () => {
      alive = false
    }
  }, [id])

  if (state.error) return <ErrorView message={state.error.message} />
  if (!state.data) return <Loading />
  const c = state.data
  return (
    <article aria-label="자기소개서 미리보기" className="inner-card border-ink border p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="card-title">{c.title}</h2>
          <p className="mt-1 text-[13px]">
            {SOURCE_LABEL[c.source]} · {formatDate(c.createdAt)}
          </p>
        </div>
        <Link to={`/cover-letters/${c.id}`} className="btn btn-sm btn-secondary">
          크게 보기
        </Link>
      </div>
      <p className="mt-6 text-[17px] leading-[1.7] whitespace-pre-wrap">{c.body}</p>
    </article>
  )
}
