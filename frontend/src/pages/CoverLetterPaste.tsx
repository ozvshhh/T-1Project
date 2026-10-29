import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { StageBlock } from '@/components/StageBlock'

export default function CoverLetterPaste() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError(null)
    if (!body.trim()) return
    setBusy(true)
    try {
      const { coverLetter } = await api.createCoverLetter({
        title: title.trim() || undefined,
        body,
      })
      navigate(`/cover-letters/${coverLetter.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
      setBusy(false)
    }
  }

  return (
    <main className="wrap grid gap-4 pt-12">
      <StageBlock stage="coverLetter">
        <h1 className="h2">쓴 자소서 붙여넣기</h1>
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
          <label htmlFor="cl-body" className="label mb-2 block">
            본문
          </label>
          <textarea
            id="cl-body"
            className="field"
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {submitted && !body.trim() && <p className="field-error">본문을 입력해 주세요.</p>}
        </div>
        {error && <p className="field-error">{error}</p>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            저장
          </button>
        </div>
      </form>
    </main>
  )
}
