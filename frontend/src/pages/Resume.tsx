import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { ResumeTemplateItem } from '@/api/types'
import { CheckMark } from '@/components/CheckMark'
import { ErrorView, Loading, PageTitle } from '@/components/States'
import { useLoad } from '@/lib/useLoad'

export default function Resume() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [template, resume] = await Promise.all([api.resumeTemplate(), api.getResume()])
    return { template: template.items, resume: resume.resume }
  })

  return (
    <main className="wrap">
      <PageTitle eyebrow="01 이력서" title="내 이력서" />
      {loading && <Loading />}
      {error && <ErrorView message={error.message} onRetry={reload} />}
      {data && (
        <ResumeEditor
          template={data.template}
          initial={Object.fromEntries(data.resume?.items.map((i) => [i.key, i.content]) ?? [])}
        />
      )}
    </main>
  )
}

function ResumeEditor({
  template,
  initial,
}: {
  template: ResumeTemplateItem[]
  initial: Record<string, string>
}) {
  // 저장된 이력서가 있으면 그 상태로, 없으면 모두 꺼진 상태로 연다.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(Object.keys(initial)))
  const [contents, setContents] = useState<Record<string, string>>(initial)
  const [active, setActive] = useState<string | null>(Object.keys(initial)[0] ?? null)
  const [message, setMessage] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const chosen = template.filter((t) => selected.has(t.key))
  const written = chosen.filter((t) => contents[t.key]?.trim())

  useEffect(() => {
    if (!active) return
    document.getElementById(`resume-${active}`)?.focus({ preventScroll: false })
  }, [active])

  function toggle(key: string) {
    setMessage(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setActive(selected.has(key) ? null : key)
  }

  async function onSave() {
    setMessage(null)
    if (chosen.length === 0) {
      setMessage({ kind: 'error', text: '항목을 하나 이상 골라 주세요.' })
      return
    }
    const empty = chosen.find((t) => !contents[t.key]?.trim())
    if (empty) {
      setMessage({
        kind: 'error',
        text: `'${empty.label}' 칸이 비어 있어요. 내용을 입력해 주세요.`,
      })
      setActive(empty.key)
      return
    }
    setBusy(true)
    try {
      await api.saveResume(chosen.map((t) => ({ key: t.key, content: contents[t.key] })))
      setMessage({ kind: 'saved', text: '저장 완료' })
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof ApiError ? err.message : '저장하지 못했어요.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="grid items-start gap-4 lg:grid-cols-[280px_1fr_320px]">
        {/* 왼쪽: 항목 고르기 */}
        <fieldset className="block-card bg-lime gap-4">
          <legend className="sr-only">항목 고르기</legend>
          <p className="label" aria-hidden>
            항목 고르기
          </p>
          <div className="flex flex-col gap-2">
            {template.map((t) => {
              const on = selected.has(t.key)
              const done = on && !!contents[t.key]?.trim()
              return (
                <label
                  key={t.key}
                  className={`row cursor-pointer items-center justify-start gap-3 ${on ? '' : 'row-pending'}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(t.key)}
                    className="accent-success size-[18px]"
                  />
                  <span className="flex-1">{t.label}</span>
                  {done && <span className="text-[13px]">작성</span>}
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* 가운데: 고른 항목마다 생기는 입력칸 */}
        <section aria-label="항목 입력" className="flex flex-col gap-4">
          {chosen.length === 0 && (
            <p className="row-pending rounded-row p-6 text-[15px]">
              왼쪽에서 쓸 항목을 고르면 여기에 입력칸이 생겨요.
            </p>
          )}
          {chosen.map((t) => (
            <div
              key={t.key}
              className={`inner-card border ${active === t.key ? 'border-ink' : 'border-transparent'}`}
            >
              <label htmlFor={`resume-${t.key}`} className="label mb-2 block">
                {t.label}
              </label>
              <textarea
                id={`resume-${t.key}`}
                rows={5}
                className="field resize-y"
                value={contents[t.key] ?? ''}
                onFocus={() => setActive(t.key)}
                onChange={(e) => {
                  setMessage(null)
                  setContents((c) => ({ ...c, [t.key]: e.target.value }))
                }}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
              저장
            </button>
            {message && (
              <p
                role={message.kind === 'error' ? 'alert' : 'status'}
                className={
                  message.kind === 'error'
                    ? 'field-error mt-0'
                    : 'flex items-center gap-2 text-[15px]'
                }
              >
                {message.kind === 'saved' && <CheckMark />}
                {message.text}
              </p>
            )}
          </div>
        </section>

        {/* 오른쪽: 진행 표시와 미리보기 */}
        <aside className="inner-card border-ink flex flex-col gap-4 border">
          <p className="label">미리보기</p>
          <p aria-live="polite" className="text-[15px]">
            고른 항목 {chosen.length}개 · 작성 {written.length}개
          </p>
          <div className="flex gap-1" aria-hidden>
            {chosen.map((t) => (
              <span
                key={t.key}
                className={`border-ink h-3.5 flex-1 rounded-[3px] border-[1.5px] ${contents[t.key]?.trim() ? 'bg-ink' : ''}`}
              />
            ))}
          </div>
          <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto">
            {written.map((t) => (
              <div key={t.key}>
                <p className="text-[13px]">{t.label}</p>
                <p className="mt-1 text-[15px] whitespace-pre-wrap">{contents[t.key]}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="rounded-block bg-lilac mt-6 flex flex-wrap items-center justify-between gap-4 p-7">
        <p className="card-title">다음 단계: 이력서로 자기소개서를 만들어요</p>
        <Link to="/cover-letters" className="btn btn-secondary">
          내 자기소개서로
        </Link>
      </div>
    </>
  )
}
