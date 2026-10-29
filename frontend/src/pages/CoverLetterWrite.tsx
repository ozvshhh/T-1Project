import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { CoverLetter, CoverLetterItem, Experience } from '@/api/types'
import { AiStatus } from '@/components/AiStatus'
import { Meter } from '@/components/Meter'
import { CheckMark } from '@/components/CheckMark'
import { StageBlock } from '@/components/StageBlock'
import { StatusRow } from '@/components/Status'
import { ErrorView, Loading } from '@/components/States'
import { hasConfirmedFact, ITEM_LABELS, ITEM_ORDER } from '@/lib/cards'
import { useAiCall } from '@/lib/useAiCall'
import { useLoad } from '@/lib/useLoad'
import NotFound from '@/pages/NotFound'

export default function CoverLetterWrite() {
  const { id = '', itemId = '' } = useParams()
  // 문항을 옮길 때마다 다시 불러와 다른 문항에서 고른 카드·응답을 반영한다.
  const loaded = useLoad(async () => {
    const [{ coverLetter }, { experiences }] = await Promise.all([
      api.getCoverLetter(id),
      api.listExperiences(),
    ])
    return { coverLetter, experiences }
  }, [id, itemId])

  if (loaded.loading) return <Loading />
  if (loaded.error?.status === 404) return <NotFound />
  if (loaded.error || !loaded.data) {
    return (
      <main className="wrap py-12">
        <ErrorView message="자소서를 불러오지 못했어요." onRetry={loaded.reload} />
      </main>
    )
  }
  const { coverLetter, experiences } = loaded.data
  const item = coverLetter.items.find((i) => i.id === itemId)
  if (!item) return <NotFound />
  return (
    <Write key={itemId} initialLetter={coverLetter} initialItem={item} experiences={experiences} />
  )
}

function Write({
  initialLetter,
  initialItem,
  experiences,
}: {
  initialLetter: CoverLetter
  initialItem: CoverLetterItem
  experiences: Experience[]
}) {
  const location = useLocation()
  const [letter, setLetter] = useState(initialLetter)
  const [item, setItem] = useState(initialItem)
  const [selected, setSelected] = useState<string[]>(initialItem.selectedExperienceIds)
  const [draft, setDraft] = useState(initialItem.answer ?? '')
  const [recDone, setRecDone] = useState(initialItem.recommendations.length > 0)
  const [noFacts, setNoFacts] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const rec = useAiCall()
  const gen = useAiCall()
  const started = useRef(false)

  const letterId = letter.id
  const index = letter.items.findIndex((i) => i.id === item.id)
  const next = letter.items[index + 1]
  const answered = letter.items.filter((i) => i.answer !== null).length
  const byId = new Map(experiences.map((e) => [e.id, e]))
  const recommended = item.recommendations.filter((r) => byId.has(r.experienceId))
  const recommendedIds = new Set(recommended.map((r) => r.experienceId))
  const others = experiences.filter((e) => hasConfirmedFact(e) && !recommendedIds.has(e.id))
  const showCards = recDone || noFacts || (!rec.busy && (rec.failed || rec.error !== null))

  function applyItem(next: CoverLetterItem) {
    setItem(next)
    setLetter((l) => ({ ...l, items: l.items.map((i) => (i.id === next.id ? next : i)) }))
  }

  useEffect(() => {
    if (started.current || initialItem.recommendations.length > 0) return
    started.current = true
    void rec.run(
      async () => {
        try {
          return await api.recommend(letterId, initialItem.id)
        } catch (e) {
          if (e instanceof ApiError && e.code === 'NO_CONFIRMED_FACTS') return null
          throw e
        }
      },
      (res) => {
        if (res) applyItem(res.item)
        else setNoFacts(true)
        setRecDone(true)
      },
    )
    // 들어올 때 한 번만 추천을 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 이 문항을 쓰는 다른 문항 번호들(화면에서 계산). */
  function usedIn(experienceId: string): number[] {
    return letter.items
      .map((i, n) => ({ i, n: n + 1 }))
      .filter(({ i }) => i.id !== item.id && i.selectedExperienceIds.includes(experienceId))
      .map(({ n }) => n)
  }

  function toggle(experienceId: string) {
    setSelected((ids) =>
      ids.includes(experienceId) ? ids.filter((x) => x !== experienceId) : [...ids, experienceId],
    )
  }

  function make(confirmOverwrite = false) {
    if (gen.busy || selected.length === 0) return
    // 사용자가 고친 응답은 확인을 받은 뒤에만 덮어쓴다(C4).
    if (!confirmOverwrite && item.answer !== null && item.answerEdited) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    const ids = selected
    void gen.run(
      async () => {
        const picked = await api.selectExperiences(letterId, item.id, ids)
        applyItem(picked.item)
        try {
          return await api.makeAnswer(letterId, item.id, confirmOverwrite || undefined)
        } catch (e) {
          if (e instanceof ApiError && e.code === 'OVERWRITE_CONFIRM_REQUIRED') return null
          throw e
        }
      },
      (res) => {
        if (!res) {
          setConfirming(true)
          return
        }
        applyItem(res.item)
        setDraft(res.item.answer ?? '')
      },
    )
  }

  async function save() {
    if (!draft.trim()) {
      setSaveError('응답을 입력해 주세요.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await api.updateItemAnswer(letterId, item.id, draft)
      applyItem(res.item)
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : '요청을 처리하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  const cardProps = (experience: Experience) => ({
    experience,
    pressed: selected.includes(experience.id),
    onToggle: () => toggle(experience.id),
    usedIn: usedIn(experience.id),
    returnTo: location.pathname,
  })

  return (
    <main className="wrap grid gap-4 pt-12 pb-12">
      <StageBlock stage="coverLetter" className="grid gap-5">
        <div className="grid gap-2">
          <Meter cells={letter.items.map((i) => i.answer !== null)} />
          <p className="meta">{`응답 ${answered} / 문항 ${letter.items.length}`}</p>
        </div>
        <nav aria-label="문항 이동" className="flex flex-wrap gap-2">
          {letter.items.map((i, n) => (
            <Link
              key={i.id}
              to={`/cover-letters/${letterId}/items/${i.id}`}
              aria-current={i.id === item.id ? 'page' : undefined}
              className={`btn btn-sm btn-secondary ${i.id === item.id ? 'font-semibold' : ''}`}
            >
              {`문항 ${n + 1}`}
            </Link>
          ))}
        </nav>
        <div className="grid gap-2">
          <p className="label">{letter.title || '제목 없음'}</p>
          <h1 className="card-title">{item.question}</h1>
        </div>
      </StageBlock>

      <StageBlock stage="coverLetter" className="grid gap-4">
        <section aria-label="추천 경험 카드" className="grid gap-3">
          <h2 className="h2">추천 경험 카드</h2>
          <AiStatus busy={rec.busy} failed={rec.failed} error={rec.error} onRetry={rec.retry} />
          {noFacts && (
            <div role="alert" className="row row-pending items-center">
              <span>확정된 사실이 있는 경험 카드가 없어요.</span>
              <Link to="/experiences" className="btn btn-sm btn-secondary">
                경험으로 가기
              </Link>
            </div>
          )}
          {showCards && (
            <ul className="grid gap-3">
              {recommended.map((r) => (
                <CardOption
                  key={r.experienceId}
                  {...cardProps(byId.get(r.experienceId) as Experience)}
                  reason={r.reason}
                />
              ))}
            </ul>
          )}
        </section>
        {showCards && others.length > 0 && (
          <section aria-label="다른 카드" className="grid gap-3">
            <h3 className="card-title">다른 카드</h3>
            <ul className="grid gap-3">
              {others.map((e) => (
                <CardOption key={e.id} {...cardProps(e)} />
              ))}
            </ul>
          </section>
        )}
        <AiStatus busy={gen.busy} failed={gen.failed} error={gen.error} onRetry={gen.retry} />
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={selected.length === 0 || gen.busy}
            onClick={() => make()}
          >
            이 문항 만들기
          </button>
        </div>
      </StageBlock>

      {item.answer !== null && (
        <StageBlock stage="coverLetter" className="grid gap-4">
          <div>
            <label htmlFor="item-answer" className="label mb-2 block">
              응답
            </label>
            <textarea
              id="item-answer"
              className="field"
              rows={8}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {saveError && <p className="field-error">{saveError}</p>}
          </div>
          <div>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={saving || draft === item.answer}
              onClick={() => void save()}
            >
              응답 저장
            </button>
          </div>
          <section aria-label="근거 경험 카드" className="grid gap-2">
            <h2 className="label">근거 경험 카드</h2>
            <ul className="grid gap-2">
              {item.usedExperienceIds.map((experienceId) => (
                <li key={experienceId} className="row">
                  {byId.get(experienceId)?.title ?? '지운 경험'}
                </li>
              ))}
            </ul>
          </section>
          <div>
            {next ? (
              <Link
                to={`/cover-letters/${letterId}/items/${next.id}`}
                className="btn btn-sm btn-secondary"
              >
                다음 문항
              </Link>
            ) : (
              <Link to={`/cover-letters/${letterId}`} className="btn btn-sm btn-secondary">
                자소서 보기
              </Link>
            )}
          </div>
        </StageBlock>
      )}

      {confirming && (
        <div className="bg-ink/40 fixed inset-0 z-10 flex items-center justify-center p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="overwrite-title"
            className="inner-card grid w-full max-w-[480px] gap-4"
          >
            <p id="overwrite-title" className="text-[15px]">
              고친 내용이 새 응답으로 바뀌어요. 계속할까요?
            </p>
            <div className="flex gap-3">
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => make(true)}>
                바꾸기
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setConfirming(false)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function CardOption({
  experience,
  reason,
  pressed,
  onToggle,
  usedIn,
  returnTo,
}: {
  experience: Experience
  reason?: string
  pressed: boolean
  onToggle: () => void
  usedIn: number[]
  returnTo: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="inner-card grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-pressed={pressed}
          className={`btn btn-sm btn-secondary ${pressed ? 'font-semibold' : ''}`}
          onClick={onToggle}
        >
          {pressed && <CheckMark />}
          {experience.title}
        </button>
        {usedIn.map((n) => (
          <span key={n} className="meta">{`문항 ${n}에 사용 중`}</span>
        ))}
        <button
          type="button"
          aria-expanded={open}
          className="btn btn-sm btn-secondary"
          onClick={() => setOpen((o) => !o)}
        >
          사실 보기
        </button>
      </div>
      {reason && <p className="text-[15px]">{reason}</p>}
      {open && (
        <div className="grid gap-2">
          {ITEM_ORDER.flatMap((key) =>
            experience.card[key].map((f) => (
              <StatusRow key={f.id} kind={f.source === 'clue' ? 'clue' : 'said'}>
                <span className="label mr-2">{ITEM_LABELS[key]}</span>
                {f.text}
              </StatusRow>
            )),
          )}
          <div>
            <Link
              to={`/experiences/${experience.id}?returnTo=${encodeURIComponent(returnTo)}`}
              className="btn btn-sm btn-secondary"
            >
              이 카드 보강하기
            </Link>
          </div>
        </div>
      )}
    </li>
  )
}
