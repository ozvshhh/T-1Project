import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { Check, CoverLetter, CoverLetterItem, Experience } from '@/api/types'
import { AiStatus } from '@/components/AiStatus'
import { StageBlock } from '@/components/StageBlock'
import { ErrorView, Loading } from '@/components/States'
import { formatDate } from '@/lib/format'
import { useAiCall } from '@/lib/useAiCall'
import { useLoad } from '@/lib/useLoad'
import NotFound from '@/pages/NotFound'

export default function CoverLetterDetail() {
  const { id = '' } = useParams()
  const loaded = useLoad(async () => {
    const [{ coverLetter, experiences }, { checks }] = await Promise.all([
      api.getCoverLetter(id),
      api.listChecks(id),
    ])
    return { coverLetter, experiences, checks }
  }, [id])

  if (loaded.loading) return <Loading />
  if (loaded.error?.status === 404) return <NotFound />
  if (loaded.error || !loaded.data) {
    return (
      <main className="wrap py-12">
        <ErrorView message="자소서를 불러오지 못했어요." onRetry={loaded.reload} />
      </main>
    )
  }
  const { coverLetter, experiences, checks } = loaded.data
  return (
    <main className="wrap grid gap-4 pt-12 pb-12">
      <StageBlock stage="coverLetter">
        <h1 className="h2">{coverLetter.title ?? '제목 없는 자소서'}</h1>
        <p className="meta mt-2">{coverLetter.kind === 'pasted' ? '붙여넣음' : '작성함'}</p>
      </StageBlock>
      {coverLetter.kind === 'pasted' ? (
        <PastedBody key={coverLetter.id} letter={coverLetter} />
      ) : (
        <GeneratedItems letter={coverLetter} experiences={experiences} />
      )}
      <CheckBlock letterId={coverLetter.id} checks={checks} />
    </main>
  )
}

function PastedBody({ letter }: { letter: CoverLetter }) {
  const [body, setBody] = useState(letter.body ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSubmitted(true)
    setSaved(false)
    setError(null)
    if (!body.trim()) return
    setSaving(true)
    try {
      await api.updateCoverLetter(letter.id, { body })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 py-4">
      <label htmlFor="cl-detail-body" className="label">
        본문
      </label>
      <textarea
        id="cl-detail-body"
        className="field"
        rows={12}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {submitted && !body.trim() && <p className="field-error">본문을 입력해 주세요.</p>}
      {error && <p className="field-error">{error}</p>}
      {saved && (
        <p role="status" className="meta">
          저장했어요.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm btn-secondary" disabled={saving} onClick={save}>
          저장
        </button>
        <p className="meta">자소서를 고치면 지난 점검은 오래됨으로 바뀌어요.</p>
      </div>
    </section>
  )
}

function GeneratedItems({
  letter,
  experiences,
}: {
  letter: CoverLetter
  experiences: Experience[]
}) {
  const byId = new Map(experiences.map((e) => [e.id, e]))
  return (
    <section className="flex flex-col gap-4 py-4">
      {letter.items.map((item, i) => (
        <ItemView key={item.id} index={i} letterId={letter.id} item={item} byId={byId} />
      ))}
    </section>
  )
}

function ItemView({
  index,
  letterId,
  item,
  byId,
}: {
  index: number
  letterId: string
  item: CoverLetterItem
  byId: Map<string, Experience>
}) {
  const itemPath = `/cover-letters/${letterId}/items/${item.id}`
  return (
    <article className="inner-card flex flex-col gap-3">
      <p className="label">문항 {index + 1}</p>
      <h2 className="card-title">{item.question}</h2>
      {item.answer === null ? (
        <div className="row-pending rounded-row flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[15px]">아직 만들지 않음</p>
          <Link to={itemPath} className="btn btn-sm btn-secondary">
            이 문항 쓰기
          </Link>
        </div>
      ) : (
        <>
          <p className="text-[15px] whitespace-pre-wrap">{item.answer}</p>
          <div>
            <p className="label mb-2">근거 경험 카드</p>
            <ul className="flex flex-col gap-2">
              {item.usedExperienceIds.map((expId) => {
                const exp = byId.get(expId)
                if (!exp) return null
                return (
                  <li
                    key={expId}
                    className="row flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <span className="text-[15px]">{exp.title}</span>
                    <Link
                      to={`/experiences/${exp.id}?returnTo=${encodeURIComponent(itemPath)}`}
                      className="btn btn-sm btn-secondary"
                    >
                      보강하기
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
          <div>
            <Link to={itemPath} className="btn btn-sm btn-secondary">
              카드 다시 고르기
            </Link>
          </div>
        </>
      )}
    </article>
  )
}

function CheckBlock({ letterId, checks }: { letterId: string; checks: Check[] }) {
  const navigate = useNavigate()
  const ai = useAiCall()
  const sorted = [...checks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  function start() {
    void ai.run(
      () => api.createCheck(letterId),
      ({ check }) => navigate(`/checks/${check.id}`),
    )
  }

  return (
    <StageBlock stage="check" className="flex flex-col gap-4">
      <h2 className="h2">제출 전 점검</h2>
      <div>
        <button type="button" className="btn btn-primary" disabled={ai.busy} onClick={start}>
          제출 전 점검 시작
        </button>
      </div>
      <AiStatus busy={ai.busy} failed={ai.failed} error={ai.error} onRetry={ai.retry} />
      <div>
        <h3 className="label mb-2">지난 점검</h3>
        {sorted.length === 0 ? (
          <p className="meta">아직 점검한 적이 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((c) => {
              const done = c.sentences.filter(
                (s) => s.status !== 'pending' && s.status !== 'in_progress',
              ).length
              return (
                <li key={c.id}>
                  <Link
                    to={`/checks/${c.id}`}
                    className="row flex flex-wrap items-center gap-3 p-3"
                  >
                    <span className="text-[15px]">{formatDate(c.createdAt)}</span>
                    <span className="meta">
                      끝난 문장 {done} / 전체 {c.sentences.length}
                    </span>
                    {c.stale && <span className="meta">오래됨</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </StageBlock>
  )
}
