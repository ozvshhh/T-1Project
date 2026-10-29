import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { CoverLetter } from '@/api/types'
import { Empty, ErrorView, Loading, PageTitle } from '@/components/States'
import { formatDate, SOURCE_LABEL } from '@/lib/format'
import { checkDevices } from '@/lib/media'
import { useLoad } from '@/lib/useLoad'

export default function InterviewStart() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const list = useLoad(() => api.listCoverLetters().then((r) => r.coverLetters))
  const [selected, setSelected] = useState<string | null>(params.get('coverLetterId'))
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onStart() {
    if (!selected) return
    setStarting(true)
    setError(null)
    try {
      const { interview } = await api.startInterview(selected)
      navigate(`/interviews/${interview.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '면접을 시작하지 못했어요.')
      setStarting(false)
    }
  }

  return (
    <main className="wrap">
      <PageTitle eyebrow="03 음성 모의면접" title="모의면접" />
      {list.loading && <Loading />}
      {list.error && <ErrorView message={list.error.message} onRetry={list.reload} />}
      {list.data?.length === 0 && (
        <Empty
          text="면접 질문은 내 자기소개서에서 나와요. 자기소개서를 먼저 만들어 주세요."
          to="/cover-letters"
          action="내 자기소개서로"
        />
      )}

      {list.data && list.data.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="flex flex-col gap-4">
            <fieldset className="block-card bg-cream gap-3">
              <legend className="sr-only">자기소개서 고르기</legend>
              <p className="label" aria-hidden>
                ① 자기소개서 고르기
              </p>
              {list.data.map((c) => (
                <label
                  key={c.id}
                  className={`row cursor-pointer items-center justify-start gap-3 ${
                    selected === c.id ? 'outline-ink outline-2 -outline-offset-2' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="coverLetter"
                    value={c.id}
                    checked={selected === c.id}
                    onChange={() => setSelected(c.id)}
                    className="accent-ink size-[18px]"
                  />
                  <span className="flex-1 font-semibold">{c.title}</span>
                  <span className="text-[13px]">
                    {SOURCE_LABEL[c.source]} · {formatDate(c.createdAt)}
                  </span>
                </label>
              ))}
            </fieldset>

            <section className="inner-card border-ink border">
              <p className="label">② 이렇게 진행돼요</p>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[15px]">
                <li>실무 면접관과 임원 면접관 2명이 내 자기소개서에서 질문해요.</li>
                <li>질문은 최대 12개, 시간은 최대 12분이에요. 언제든 끝낼 수 있어요.</li>
                <li>질문은 글자로 보이고 소리로도 읽어 줘요. 점수는 매기지 않아요.</li>
              </ul>
            </section>

            <DeviceCheck />
          </div>

          <div className="flex flex-col gap-4">
            {selected ? (
              <SelectedPreview id={selected} />
            ) : (
              <p className="row-pending rounded-row p-6 text-[15px]">
                왼쪽에서 면접에 쓸 자기소개서를 고르면 여기에 본문이 보여요.
              </p>
            )}
            <div className="rounded-block bg-coral flex flex-col items-start gap-4 p-7">
              <p className="card-title">④ 준비가 되면 시작하세요</p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selected || starting}
                onClick={onStart}
              >
                면접 시작
              </button>
              {starting && (
                <p role="status" className="text-[15px]">
                  질문을 준비하고 있어요
                </p>
              )}
              {error && (
                <p role="alert" className="field-error mt-0">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function DeviceCheck() {
  const [state, setState] = useState<'idle' | 'checking' | { camera: boolean; mic: boolean }>(
    'idle',
  )

  return (
    <section className="inner-card border-ink border">
      <p className="label">③ 카메라·마이크 확인</p>
      {typeof state === 'object' ? (
        <ul className="mt-3 flex flex-col gap-2 text-[15px]">
          <li className={`row ${state.camera ? '' : 'row-pending'}`}>
            카메라<b>{state.camera ? '쓸 수 있어요' : '안 돼요 · 검은 화면으로 진행'}</b>
          </li>
          <li className={`row ${state.mic ? '' : 'row-pending'}`}>
            마이크<b>{state.mic ? '쓸 수 있어요' : '안 돼요'}</b>
          </li>
          {!state.mic && <li>마이크가 없어도 글자로 답할 수 있어요.</li>}
        </ul>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={state === 'checking'}
            onClick={async () => {
              setState('checking')
              setState(await checkDevices())
            }}
          >
            {state === 'checking' ? '확인하는 중' : '장치 확인하기'}
          </button>
          <p className="text-[15px]">안 돼도 글자로 답할 수 있어요.</p>
        </div>
      )}
    </section>
  )
}

function SelectedPreview({ id }: { id: string }) {
  const [data, setData] = useState<CoverLetter | null>(null)
  useEffect(() => {
    let alive = true
    setData(null)
    api
      .getCoverLetter(id)
      .then((r) => alive && setData(r.coverLetter))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [id])

  if (!data) return <Loading />
  return (
    <article className="inner-card border-ink max-h-[420px] overflow-y-auto border p-7">
      <p className="label">{data.title}</p>
      <p className="mt-4 text-[15px] leading-[1.7] whitespace-pre-wrap">{data.body}</p>
    </article>
  )
}
