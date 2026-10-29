import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { PageTitle } from '@/components/States'

export default function CoverLetterNew() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!body.trim()) {
      setError('본문이 비어 있어요. 자기소개서 글을 붙여 넣어 주세요.')
      return
    }
    setBusy(true)
    try {
      const { coverLetter } = await api.createCoverLetter({
        title: title.trim() || undefined,
        body,
      })
      navigate(`/cover-letters?id=${coverLetter.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="wrap">
      <PageTitle eyebrow="02 자기소개서" title="자기소개서 등록" />
      <form onSubmit={onSubmit} noValidate className="flex max-w-[880px] flex-col gap-5">
        <div>
          <label htmlFor="cl-title" className="label mb-2 block">
            제목 <span className="font-normal">(선택)</span>
          </label>
          <input
            id="cl-title"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="비워 두면 '자기소개서 N'으로 저장돼요"
          />
        </div>
        <div>
          <label htmlFor="cl-body" className="label mb-2 block">
            본문
          </label>
          <textarea
            id="cl-body"
            rows={16}
            className="field resize-y leading-[1.7]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="이미 쓴 자기소개서 글을 붙여 넣으세요"
          />
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            저장
          </button>
        </div>
      </form>
    </main>
  )
}
