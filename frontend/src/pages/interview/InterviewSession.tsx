import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type AnswerInput } from '@/api/client'
import type { InterviewSession as Session, Interviewer, Question } from '@/api/types'
import { ErrorView, Loading } from '@/components/States'
import { useCamera, useRecorder } from '@/lib/media'
import { useLoad } from '@/lib/useLoad'
import NotFound from '@/pages/NotFound'

const INTERVIEWERS: { key: Interviewer; label: string; role: string }[] = [
  { key: 'practical', label: '실무 면접관', role: '직무 경험과 행동을 물어요' },
  { key: 'executive', label: '임원 면접관', role: '기여도와 결과를 파고들어요' },
]

export default function InterviewSession() {
  const { id = '' } = useParams()
  const { data, error, loading, reload, setData } = useLoad(
    () => api.getInterview(id).then((r) => r.interview),
    [id],
  )

  if (error?.code === 'NOT_FOUND') return <NotFound />
  if (data?.status === 'finished') return <Navigate to={`/interviews/${id}/result`} replace />

  return (
    <main className="wrap pt-8">
      {loading && !data && <Loading />}
      {error && <ErrorView message={error.message} onRetry={reload} />}
      {data?.currentQuestion && (
        <Room interview={data} question={data.currentQuestion} onChange={setData} />
      )}
    </main>
  )
}

type Phase = 'idle' | 'recording' | 'transcribing' | 'review' | 'submitting'

function Room({
  interview,
  question,
  onChange,
}: {
  interview: Session
  question: Question
  onChange: (s: Session) => void
}) {
  const navigate = useNavigate()
  const recorder = useRecorder()
  const [phase, setPhase] = useState<Phase>('idle')
  const [textMode, setTextMode] = useState(false)
  const [text, setText] = useState('')
  const [transcriptRaw, setTranscriptRaw] = useState<string | undefined>()
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null)
  const [ending, setEnding] = useState(false)

  const basis = interview.mainQuestions.find((m) => m.id === question.mainQuestionId)?.basisSentence
  const number = interview.turns.length + 1
  const busy = phase === 'submitting' || phase === 'transcribing' || ending

  const goResult = useCallback(
    () => navigate(`/interviews/${interview.id}/result`),
    [navigate, interview.id],
  )

  // 질문이 바뀌면 답변 칸을 비운다.
  useEffect(() => {
    setPhase('idle')
    setText('')
    setTranscriptRaw(undefined)
    setTextMode(false)
    setNotice(null)
    setError(null)
  }, [question.id])

  async function startRecording() {
    setNotice(null)
    try {
      await recorder.start()
      setPhase('recording')
    } catch (e) {
      setNotice((e as Error).message)
    }
  }

  async function stopRecording() {
    const audio = await recorder.stop()
    setPhase('transcribing')
    try {
      const { text: transcript } = await api.transcribe(interview.id, audio)
      setText(transcript)
      setTranscriptRaw(transcript)
      setPhase('review')
    } catch (e) {
      const err = e as ApiError
      setNotice(
        err.code === 'EMPTY_TRANSCRIPT'
          ? '다시 말해 주세요. 목소리를 알아듣지 못했어요.'
          : err.message,
      )
      setPhase('idle')
    }
  }

  async function submit() {
    if (!text.trim()) {
      setNotice('답변을 입력해 주세요.')
      return
    }
    const input: AnswerInput = {
      questionId: question.id,
      text,
      inputMode: transcriptRaw !== undefined ? 'voice' : 'text',
      transcriptRaw,
    }
    setPhase('submitting')
    setError(null)
    try {
      const res = await api.answer(interview.id, input)
      if (res.next.action === 'finished') return goResult()
      onChange(res.interview)
    } catch (e) {
      // AI 판단 실패 시 동작은 [학생 답 대기]. 임시로 답변을 유지하고 다시 시도하게 한다.
      const err = e as ApiError
      if (err.code === 'INTERVIEW_FINISHED') return goResult()
      setError({ message: err.message, retry: submit })
      setPhase(transcriptRaw !== undefined ? 'review' : 'idle')
    }
  }

  async function skip() {
    setError(null)
    setPhase('submitting')
    try {
      const res = await api.skip(interview.id, question.id)
      if (res.next.action === 'finished') return goResult()
      onChange(res.interview)
    } catch (e) {
      setError({ message: (e as ApiError).message })
      setPhase('idle')
    }
  }

  async function end() {
    setEnding(true)
    setError(null)
    try {
      await api.end(interview.id)
      goResult()
    } catch (e) {
      setError({ message: (e as ApiError).message, retry: end })
      setEnding(false)
    }
  }

  const showAnswerBox = textMode || phase === 'review' || (phase === 'submitting' && text !== '')

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_400px]">
      {/* 왼쪽: 면접관·질문 */}
      <section className="flex flex-col gap-4" aria-label="면접관과 질문">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-4">
            <p className="label tabular-nums">
              질문 {number} / 최대 {interview.limits.maxQuestions}
            </p>
            <ProgressMeter done={number - 1} total={interview.limits.maxQuestions} />
          </div>
          <Timer startedAt={interview.startedAt} minutes={interview.limits.maxMinutes} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {INTERVIEWERS.map((p) => {
            const speaking = p.key === question.interviewer
            return (
              <div
                key={p.key}
                className={`block-card min-h-[140px] justify-between transition-colors duration-300 ${
                  speaking ? 'bg-cream' : 'border-ink/25 border'
                }`}
              >
                <p className="label flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-2 rounded-full ${speaking ? 'bg-ink motion-safe:animate-pulse' : 'border-ink/40 border'}`}
                  />
                  {speaking ? '말하는 중' : '듣는 중'}
                </p>
                <div className={speaking ? '' : 'opacity-50'}>
                  <p className="card-title">{p.label}</p>
                  <p className="mt-1 text-[15px]">{p.role}</p>
                </div>
              </div>
            )
          })}
        </div>

        <article className="rounded-block bg-ink text-ink-inverse p-[clamp(28px,4vw,48px)]">
          <p className="flex items-center text-[15px]">
            <span className="text-cream">{question.interviewerLabel}</span>
            <span className="rounded-pill border-ink-inverse/30 ml-2 border px-2.5 py-0.5 text-[13px]">
              {question.kind === 'main' ? '본질문' : '꼬리질문'}
            </span>
          </p>
          <h1 className="mt-5 max-w-[30em] text-[clamp(26px,2.6vw,36px)] leading-[1.4] tracking-[-0.025em]">
            {question.text}
          </h1>
          {basis && (
            <p className="border-hairline mt-8 border-t pt-5 text-[15px]">
              <span className="text-lilac text-[13px]">이 질문의 근거 · 내 자기소개서</span>
              <span className="mt-1.5 block leading-[1.6] opacity-80">“{basis}”</span>
            </p>
          )}
          <QuestionVoice interviewId={interview.id} questionId={question.id} />
        </article>

        <TurnLog interview={interview} />
      </section>

      {/* 오른쪽: 내 카메라와 답변 */}
      <section className="flex flex-col gap-4" aria-label="내 답변">
        <CameraPreview />

        <div className="inner-card border-ink flex flex-col gap-4 border p-6">
          <p className="label">내 답변</p>

          {!showAnswerBox && (
            <div className="flex flex-wrap gap-2">
              {phase === 'recording' ? (
                <button type="button" className="btn btn-primary" onClick={stopRecording}>
                  녹음 끝내기
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={startRecording}
                  disabled={busy}
                >
                  말로 답하기
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTextMode(true)}
                disabled={phase === 'recording' || busy}
              >
                글자로 답하기
              </button>
            </div>
          )}

          {phase === 'recording' && (
            <p role="status" className="flex items-center gap-2 text-[15px]">
              <span
                aria-hidden
                className="bg-ink size-2.5 rounded-full motion-safe:animate-pulse"
              />
              듣는 중이에요. 다 말했으면 '녹음 끝내기'를 누르세요.
            </p>
          )}
          {phase === 'transcribing' && (
            <p role="status" className="dots text-[15px]">
              말한 내용을 글로 옮기고 있어요
            </p>
          )}

          {showAnswerBox && (
            <div>
              <label htmlFor="answer" className="label mb-2 block">
                답변
              </label>
              {transcriptRaw !== undefined && (
                <p className="mb-2 text-[15px]">
                  말한 내용을 글로 옮겼어요. 확인하고 고친 뒤 제출하세요.
                </p>
              )}
              <textarea
                id="answer"
                rows={6}
                className="field resize-y"
                value={text}
                disabled={phase === 'submitting'}
                onChange={(e) => {
                  setNotice(null)
                  setText(e.target.value)
                }}
              />
            </div>
          )}

          {notice && (
            <p role="alert" className="field-error mt-0">
              {notice}
            </p>
          )}
          {error && <ErrorView message={error.message} onRetry={error.retry} />}
          {phase === 'submitting' && (
            <p role="status" className="dots text-[15px]">
              다음 질문을 준비하고 있어요
            </p>
          )}

          <div className="border-ink/15 flex flex-wrap gap-2 border-t pt-4">
            {showAnswerBox && (
              <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
                답변 제출
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={skip}
              disabled={busy || phase === 'recording'}
            >
              건너뛰기
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={end}
              disabled={ending}
            >
              {ending ? '끝내는 중' : '면접 종료'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

/** DESIGN.md progress-meter: 칸마다 검정 테두리, 지난 질문은 채운다. */
function ProgressMeter({ done, total }: { done: number; total: number }) {
  return (
    <div aria-hidden className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`border-ink h-3.5 w-3 border-[1.5px] transition-colors duration-300 ${
            i < done ? 'bg-ink' : ''
          }`}
        />
      ))}
    </div>
  )
}

function Timer({ startedAt, minutes }: { startedAt: string; minutes: number }) {
  const deadline = Date.parse(startedAt) + minutes * 60_000
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, Math.floor((deadline - now) / 1000))
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <p className={`rounded-pill px-3 py-1 text-[15px] ${left <= 60 ? 'bg-coral' : ''}`}>
      남은 시간{' '}
      <span className="font-semibold tabular-nums">
        {mm}:{ss}
      </span>
    </p>
  )
}

/** 질문을 소리로 읽는다. 실패해도 글자는 그대로 보이고 진행된다. */
function QuestionVoice({ interviewId, questionId }: { interviewId: string; questionId: string }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [failed, setFailed] = useState(false)

  const play = useCallback(async () => {
    setFailed(false)
    try {
      if (!audio.current) {
        const blob = await api.tts(interviewId, questionId)
        audio.current = new Audio(URL.createObjectURL(blob))
      }
      audio.current.currentTime = 0
      await audio.current.play()
    } catch {
      setFailed(true)
    }
  }, [interviewId, questionId])

  useEffect(() => {
    audio.current = null
    void play()
    return () => {
      audio.current?.pause()
      if (audio.current) URL.revokeObjectURL(audio.current.src)
    }
  }, [play])

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <button type="button" onClick={play} className="btn btn-sm btn-on-ink">
        질문 다시 듣기
      </button>
      {failed && (
        <p className="text-[15px] opacity-80">
          소리를 재생하지 못했어요. 질문은 글자로 확인하세요.
        </p>
      )}
    </div>
  )
}

function CameraPreview() {
  const stream = useCamera()
  const video = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    if (video.current) video.current.srcObject = stream
  }, [stream])

  return (
    <div
      className="rounded-block bg-ink relative aspect-video overflow-hidden"
      aria-label="내 카메라"
    >
      {stream && (
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          className="size-full -scale-x-100 object-cover"
        />
      )}
      {!stream && (
        <span className="text-ink-inverse/50 absolute inset-0 flex items-center justify-center text-[15px]">
          카메라 꺼짐 · 면접은 그대로 진행돼요
        </span>
      )}
      <span className="rounded-pill bg-ink/70 text-ink-inverse absolute bottom-3 left-3 px-3 py-1 text-[13px]">
        나
      </span>
    </div>
  )
}

function TurnLog({ interview }: { interview: Session }) {
  if (interview.turns.length === 0) return null
  return (
    <details className="inner-card border-ink/15 border p-6" open>
      <summary className="label cursor-pointer select-none">
        대화 기록 ({interview.turns.length})
      </summary>
      <ol className="mt-5 flex flex-col gap-5">
        {interview.turns.map((t) => (
          <li key={t.question.id} className="flex flex-col gap-2 text-[15px] leading-[1.6]">
            <p className="max-w-[85%]">
              <span className="meta mr-2">{t.question.interviewerLabel}</span>
              {t.question.text}
            </p>
            <p
              className={`rounded-card max-w-[85%] self-end px-4 py-2.5 ${t.skipped ? 'row-pending' : 'bg-cream'}`}
            >
              <span className="meta mr-2">나</span>
              {t.skipped ? '건너뜀' : t.answer?.text}
            </p>
          </li>
        ))}
      </ol>
    </details>
  )
}
