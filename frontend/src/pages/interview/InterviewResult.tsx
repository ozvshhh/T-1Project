import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { Result, Suggestion } from '@/api/types'
import { CheckMark } from '@/components/CheckMark'
import { ErrorView, Loading, PageTitle } from '@/components/States'
import { END_REASON_LABEL } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'
import NotFound from '@/pages/NotFound'

const FIELD_LABEL = { role: '역할', reason: '선택 이유', result: '결과' } as const
const STATUS_LABEL = { pending: '대기', accepted: '반영됨', rejected: '거절됨' } as const

export default function InterviewResult() {
  const { id = '' } = useParams()
  const { data, error, loading, reload, setData } = useLoad(async () => {
    const [{ result }, { interview }] = await Promise.all([api.getResult(id), api.getInterview(id)])
    return { result, interview }
  }, [id])

  if (error?.code === 'NOT_FOUND') return <NotFound />
  // 아직 진행 중인 면접이면 진행 화면으로 보낸다.
  if (error?.status === 409) return <Navigate to={`/interviews/${id}`} replace />

  if (loading && !data) {
    return (
      <main className="wrap">
        <Loading text="결과를 정리하고 있어요" />
      </main>
    )
  }
  if (error || !data) {
    return (
      <main className="wrap pt-12">
        <ErrorView message={error?.message ?? '결과를 불러오지 못했어요.'} onRetry={reload} />
      </main>
    )
  }

  const { result, interview } = data
  const partial = result.resultStatus === 'partial'
  const updateSuggestion = (s: Suggestion) =>
    setData({
      ...data,
      result: { ...result, suggestions: result.suggestions.map((x) => (x.id === s.id ? s : x)) },
    })

  return (
    <main className="wrap">
      <PageTitle eyebrow="면접 결과" title={interview.coverLetterSnapshot.title} />
      {/* 점수는 두지 않는다(F8). 요약은 사실만: 종료 사유와 개수. */}
      <dl className="border-ink mb-14 grid grid-cols-2 border-t md:grid-cols-4">
        {[
          ['종료 사유', interview.endReason ? END_REASON_LABEL[interview.endReason] : '-'],
          ['질문', `${result.transcript.length}개`],
          ['보완할 항목', partial ? '-' : `${Math.min(result.openItems.length, 3)}개`],
          ['수정 제안', partial ? '-' : `${result.suggestions.length}개`],
        ].map(([k, v]) => (
          <div key={k} className="pt-4 pr-4">
            <dt className="meta">{k}</dt>
            <dd className="mt-1 text-[26px] font-medium tracking-[-0.02em] tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-14">
        <Section n="1" title="질문·답변 기록">
          <ol className="flex flex-col gap-3">
            {result.transcript.map((t) => (
              <li
                key={t.question.id}
                id={`turn-${t.question.id}`}
                className="inner-card border-ink/15 target:outline-ink flex scroll-mt-24 flex-col gap-2.5 border p-6 target:outline-2"
              >
                <p className="meta">
                  {t.question.interviewerLabel} · {t.question.purpose} ·{' '}
                  {t.question.kind === 'main' ? '본질문' : '꼬리질문'}
                </p>
                <p className="text-[17px] leading-[1.55] font-medium">{t.question.text}</p>
                <p
                  className={`rounded-row px-4 py-3 text-[15px] leading-[1.65] ${t.skipped ? 'row-pending' : 'bg-cream'}`}
                >
                  <span className="meta mr-2">내 답변</span>
                  {t.skipped ? '건너뜀' : (t.answer?.text ?? '답하지 않음')}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        {partial ? (
          <p className="row-pending rounded-row p-6 text-[15px]">결과 분석을 만들지 못했어요.</p>
        ) : (
          <>
            <Section n="2" title="구체화된 경험">
              {result.clarifiedExperiences.length === 0 ? (
                <p className="text-[15px]">이번 면접에서 새로 설명한 내용이 없어요.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {result.clarifiedExperiences.map((e) => (
                    <li
                      key={e.basisAnswerId + e.field}
                      className="row items-baseline justify-start gap-4 px-0 leading-[1.65]"
                    >
                      <span className="rounded-pill bg-lime shrink-0 px-3 py-0.5 text-[13px] font-semibold">
                        {FIELD_LABEL[e.field]}
                      </span>
                      <span>{e.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section n="3" title="아직 보완할 항목">
              {result.openItems.length === 0 ? (
                <p className="text-[15px]">보완할 항목이 없어요.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {result.openItems.slice(0, 3).map((o) => (
                    <li
                      key={o.basisQuestionId}
                      className="row row-pending items-center gap-4 px-4 py-3.5 leading-[1.6]"
                    >
                      <span>{o.text}</span>
                      <a
                        href={`#turn-${o.basisQuestionId}`}
                        className="hover:decoration-ink shrink-0 text-[13px] underline decoration-transparent underline-offset-4 transition-colors"
                      >
                        해당 답변 보기 ↑
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Suggestions interviewId={interview.id} result={result} onChange={updateSuggestion} />
          </>
        )}
      </div>

      <div className="border-ink/15 mt-14 flex flex-wrap gap-3 border-t pt-8">
        <Link to="/interviews" className="btn btn-secondary">
          면접 기록으로
        </Link>
        <Link to={`/cover-letters?id=${interview.coverLetterId}`} className="btn btn-secondary">
          자기소개서 보기
        </Link>
      </div>
    </main>
  )
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`section-${n}`} className="flex flex-col gap-5">
      <h2 id={`section-${n}`} className="card-title flex items-baseline gap-3">
        <span className="meta font-semibold opacity-100">0{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Suggestions({
  interviewId,
  result,
  onChange,
}: {
  interviewId: string
  result: Result
  onChange: (s: Suggestion) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function decide(s: Suggestion, accept: boolean) {
    setBusy(s.id)
    setErrors((e) => ({ ...e, [s.id]: '' }))
    try {
      const res = accept
        ? await api.acceptSuggestion(interviewId, s.id)
        : await api.rejectSuggestion(interviewId, s.id)
      onChange({ ...s, ...res.suggestion })
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [s.id]: err instanceof ApiError ? err.message : '처리하지 못했어요.',
      }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section n="4" title="자기소개서 수정 제안">
      {result.suggestions.length === 0 && <p className="text-[15px]">수정 제안이 없어요.</p>}
      <ul className="flex flex-col gap-4">
        {result.suggestions.map((s) => (
          <li
            key={s.id}
            className={`block-card bg-lilac gap-5 transition-opacity duration-300 ${s.status === 'rejected' ? 'opacity-60' : ''}`}
          >
            <p className="label flex items-center gap-2" aria-live="polite">
              {s.status === 'accepted' && <CheckMark />}
              {STATUS_LABEL[s.status]}
            </p>
            <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
              <div
                className={`inner-card bg-canvas/50 ${s.status === 'accepted' ? 'opacity-50' : ''}`}
              >
                <p className="meta">원래 문장</p>
                <p
                  className={`mt-1.5 text-[15px] leading-[1.65] ${s.status === 'accepted' ? 'line-through' : ''}`}
                >
                  {s.original}
                </p>
              </div>
              <span aria-hidden className="hidden items-center text-xl md:flex">
                →
              </span>
              <div className="inner-card">
                <p className="meta">바꿀 문장</p>
                <p className="mt-1.5 text-[15px] leading-[1.65] font-medium">{s.proposed}</p>
              </div>
            </div>
            <p className="max-w-[640px] text-[15px] leading-[1.65]">
              <span className="meta mr-2 opacity-100">이유</span>
              {s.why}
            </p>
            {s.status === 'pending' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy === s.id}
                  onClick={() => decide(s, true)}
                >
                  {busy === s.id ? '반영하는 중' : '승인'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  disabled={busy === s.id}
                  onClick={() => decide(s, false)}
                >
                  거절
                </button>
              </div>
            )}
            {errors[s.id] && (
              <p role="alert" className="field-error mt-0">
                {errors[s.id]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}
