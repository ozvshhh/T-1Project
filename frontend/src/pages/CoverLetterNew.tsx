import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { StageBlock } from '@/components/StageBlock'

type Question = { key: number; text: string }

export default function CoverLetterNew() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [preferred, setPreferred] = useState('')
  const [talent, setTalent] = useState('')
  const [questions, setQuestions] = useState<Question[]>([{ key: 1, text: '' }])
  const [nextKey, setNextKey] = useState(2)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filled = questions.map((q) => q.text.trim()).filter(Boolean)

  function setText(key: number, text: string) {
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, text } : q)))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError(null)
    if (!preferred.trim() || !talent.trim() || filled.length === 0) return
    setBusy(true)
    try {
      const { coverLetter } = await api.generateCoverLetter({
        title: title.trim() || undefined,
        preferred,
        talent,
        questions: filled,
      })
      navigate(`/cover-letters/${coverLetter.id}/items/${coverLetter.items?.[0]?.id ?? ''}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
      setBusy(false)
    }
  }

  return (
    <main className="wrap grid gap-4 pt-12">
      <StageBlock stage="coverLetter">
        <h1 className="h2">자소서 새로 쓰기</h1>
      </StageBlock>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 py-6">
        <div>
          <label htmlFor="cl-title" className="label mb-2 block">
            제목
          </label>
          <input
            id="cl-title"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cl-preferred" className="label mb-2 block">
            우대사항
          </label>
          <textarea
            id="cl-preferred"
            className="field"
            rows={3}
            value={preferred}
            onChange={(e) => setPreferred(e.target.value)}
          />
          {submitted && !preferred.trim() && <p className="field-error">필수 입력이에요.</p>}
        </div>
        <div>
          <label htmlFor="cl-talent" className="label mb-2 block">
            인재상
          </label>
          <textarea
            id="cl-talent"
            className="field"
            rows={3}
            value={talent}
            onChange={(e) => setTalent(e.target.value)}
          />
          {submitted && !talent.trim() && <p className="field-error">필수 입력이에요.</p>}
        </div>
        <div className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <div key={q.key}>
              <label htmlFor={`cl-q-${q.key}`} className="label mb-2 block">
                {`문항 ${i + 1}`}
              </label>
              <div className="flex items-start gap-2">
                <textarea
                  id={`cl-q-${q.key}`}
                  className="field"
                  rows={2}
                  value={q.text}
                  onChange={(e) => setText(q.key, e.target.value)}
                />
                {questions.length >= 2 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))}
                  >
                    빼기
                  </button>
                )}
              </div>
            </div>
          ))}
          {submitted && filled.length === 0 && <p className="field-error">필수 입력이에요.</p>}
          <div>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => {
                setQuestions((qs) => [...qs, { key: nextKey, text: '' }])
                setNextKey(nextKey + 1)
              }}
            >
              문항 추가
            </button>
          </div>
        </div>
        {error && <p className="field-error">{error}</p>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            작성 시작
          </button>
        </div>
      </form>
    </main>
  )
}
