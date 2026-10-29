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
      <div className="mb-8 flex flex-wrap gap-2 text-[15px]">
        <span className="row">
          종료 사유{' '}
          <b className="ml-2">
            {interview.endReason ? END_REASON_LABEL[interview.endReason] : '-'}
          </b>
        </span>
        <span className="row">
          질문 <b className="ml-2">{result.transcript.length}개</b>
        </span>
      </div>

      <div className="flex flex-col gap-6">
        <Section n="1" title="질문·답변 기록">
          <ol className="flex flex-col gap-3">
            {result.transcript.map((t) => (
              <li
                key={t.question.id}
                id={`turn-${t.question.id}`}
                className="inner-card border-ink flex scroll-mt-6 flex-col gap-2 border"
              >
                <p className="text-[13px]">
                  {t.question.interviewerLabel} · {t.question.purpose} ·{' '}
                  {t.question.kind === 'main' ? '본질문' : '꼬리질문'}
                </p>
                <p className="text-[17px] font-medium">{t.question.text}</p>
                <p
                  className={`rounded-row px-3 py-2 text-[15px] ${t.skipped ? 'row-pending' : 'bg-cream'}`}
                >
                  <b>내 답변</b> {t.skipped ? '건너뜀' : (t.answer?.text ?? '답하지 않음')}
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
                    <li key={e.basisAnswerId + e.field} className="row justify-start gap-3">
                      <b className="shrink-0">{FIELD_LABEL[e.field]}</b>
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
                    <li key={o.basisQuestionId} className="row row-pending items-center">
                      <span>{o.text}</span>
                      <a
                        href={`#turn-${o.basisQuestionId}`}
                        className="shrink-0 text-[13px] underline underline-offset-4"
                      >
                        해당 답변 보기
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

      <div className="mt-8 flex flex-wrap gap-3">
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
    <section aria-labelledby={`section-${n}`} className="flex flex-col gap-4">
      <h2 id={`section-${n}`} className="card-title">
        <span className="mr-3 text-[15px] font-semibold">{n}</span>
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
          <li key={s.id} className="block-card bg-lilac gap-4">
            <p className="label flex items-center gap-2" aria-live="polite">
              {s.status === 'accepted' && <CheckMark />}
              {STATUS_LABEL[s.status]}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="inner-card">
                <p className="text-[13px]">원래 문장</p>
                <p className="mt-1 text-[15px]">{s.original}</p>
              </div>
              <div className="inner-card">
                <p className="text-[13px]">바꿀 문장</p>
                <p className="mt-1 text-[15px]">{s.proposed}</p>
              </div>
            </div>
            <p className="text-[15px]">
              <b>이유</b> {s.why}
            </p>
            {s.status === 'pending' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy === s.id}
                  onClick={() => decide(s, true)}
                >
                  승인
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
