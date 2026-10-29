import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { ActivityDraft, Resume as ResumeData } from '@/api/types'
import { AiStatus } from '@/components/AiStatus'
import { ErrorView, Loading } from '@/components/States'
import { StageBlock } from '@/components/StageBlock'
import { useAiCall } from '@/lib/useAiCall'
import { useLoad } from '@/lib/useLoad'

export default function Resume() {
  const { data, error, loading, reload } = useLoad(async () => (await api.getResume()).resume)
  if (loading) {
    return (
      <main className="wrap pt-12">
        <Loading />
      </main>
    )
  }
  if (error || !data) {
    return (
      <main className="wrap pt-12">
        <ErrorView message={error?.message ?? '불러오지 못했어요.'} onRetry={reload} />
      </main>
    )
  }
  return <ResumeForm initial={data} />
}

type DraftForm = { id: string | null; title: string; period: string; summary: string }
const EMPTY_FORM: DraftForm = { id: null, title: '', period: '', summary: '' }

function ResumeForm({ initial }: { initial: ResumeData }) {
  const navigate = useNavigate()
  const [text, setText] = useState(initial.text ?? '')
  const [pasted, setPasted] = useState(Boolean(initial.text))
  const [drafts, setDrafts] = useState<ActivityDraft[]>(initial.drafts)
  // 고치기·직접 추가 폼은 하나만 연다.
  const [form, setForm] = useState<DraftForm | null>(null)
  const [formSubmitted, setFormSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const ai = useAiCall()

  function split(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || ai.busy) return
    void ai.run(
      () => api.splitResume(text),
      (res) => {
        setDrafts(res.resume.drafts)
        setPasted(true)
      },
    )
  }

  function openForm(next: DraftForm) {
    setForm(next)
    setFormSubmitted(false)
    setError(null)
  }

  async function saveForm(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setFormSubmitted(true)
    if (!form.title.trim()) return
    setError(null)
    const input = {
      title: form.title.trim(),
      period: form.period.trim(),
      summary: form.summary.trim(),
    }
    try {
      if (form.id) {
        const { draft } = await api.updateDraft(form.id, input)
        setDrafts((list) => list.map((d) => (d.id === draft.id ? draft : d)))
      } else {
        const { draft } = await api.addDraft(input)
        setDrafts((list) => [...list, draft])
      }
      setForm(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
    }
  }

  async function removeDraft(id: string) {
    setError(null)
    try {
      await api.deleteDraft(id)
      setDrafts((list) => list.filter((d) => d.id !== id))
      if (form?.id === id) setForm(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
    }
  }

  async function confirmAll() {
    if (drafts.length === 0 || confirming) return
    setConfirming(true)
    setError(null)
    try {
      const { experiences } = await api.confirmDrafts(drafts.map((d) => d.id))
      navigate(`/experiences/${experiences[0].id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
      setConfirming(false)
    }
  }

  return (
    <main className="wrap grid gap-4 pt-12 pb-12">
      <StageBlock stage="experience">
        <h1 className="h2">이력서 입력</h1>
        <form onSubmit={split} className="grid gap-3">
          <div>
            <label htmlFor="resume-text" className="label mb-2 block">
              이력서
            </label>
            <textarea
              id="resume-text"
              className="field"
              rows={8}
              placeholder="이력서나 활동 목록을 그대로 붙여넣어 주세요"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          {pasted && <p className="meta">다시 붙여넣으면 새로 나온 활동만 목록에 더해요.</p>}
          <AiStatus busy={ai.busy} failed={ai.failed} error={ai.error} onRetry={ai.retry} />
          <div>
            <button type="submit" className="btn btn-secondary" disabled={ai.busy || !text.trim()}>
              활동 나누기
            </button>
          </div>
        </form>
      </StageBlock>

      <StageBlock stage="experience" className="grid gap-4">
        <h2 className="h2">확인할 활동</h2>
        {drafts.length === 0 ? (
          <div className="row-pending rounded-row p-6">
            <p className="text-[15px]">확인할 활동이 없어요</p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {drafts.map((draft) => (
              <li key={draft.id} className="inner-card grid gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="card-title">{draft.title}</span>
                  <span className="meta">{draft.period}</span>
                </div>
                {draft.summary && <p className="line-clamp-2 text-[15px]">{draft.summary}</p>}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() =>
                      openForm({
                        id: draft.id,
                        title: draft.title,
                        period: draft.period,
                        summary: draft.summary,
                      })
                    }
                  >
                    고치기
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => void removeDraft(draft.id)}
                  >
                    빼기
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {form ? (
          <form onSubmit={saveForm} noValidate className="inner-card grid gap-3">
            <div>
              <label htmlFor="draft-title" className="label mb-2 block">
                활동 이름
              </label>
              <input
                id="draft-title"
                className="field"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              {formSubmitted && !form.title.trim() && (
                <p className="field-error">필수 입력이에요.</p>
              )}
            </div>
            <div>
              <label htmlFor="draft-period" className="label mb-2 block">
                대략적 시기
              </label>
              <input
                id="draft-period"
                className="field"
                placeholder="예: 2025년 여름"
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="draft-summary" className="label mb-2 block">
                한 줄 설명
              </label>
              <input
                id="draft-summary"
                className="field"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn btn-sm btn-primary">
                {form.id ? '저장' : '목록에 추가'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setForm(null)}
              >
                취소
              </button>
            </div>
          </form>
        ) : (
          <div>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => openForm(EMPTY_FORM)}
            >
              활동 직접 추가
            </button>
          </div>
        )}

        {error && <p className="field-error">{error}</p>}
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={drafts.length === 0 || confirming}
            onClick={() => void confirmAll()}
          >
            경험 만들기
          </button>
        </div>
      </StageBlock>
    </main>
  )
}
