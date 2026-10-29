import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/context'
import { STAGES, type Stage } from '@/lib/stages'

// 소개 화면은 흐름의 세 단계 자체를 보여 주므로 단계 색 블록을 그대로 쓴다(specs/01-auth.md).
const STEPS: { stage: Stage; text: string }[] = [
  { stage: 'experience', text: '대화로 경험을 풀어 쓰고 사실로 확정해요.' },
  { stage: 'coverLetter', text: '확정한 경험 카드로 문항마다 초안을 만들어요.' },
  { stage: 'check', text: '주장 문장마다 근거를 묻고 설명할 수 있는지 봐요.' },
]

export default function Intro() {
  const { user } = useAuth()
  if (user) return <Navigate to="/cover-letters" replace />

  return (
    <main className="wrap grid gap-4 pt-12">
      <h1 className="display">
        경험을 대화로 꺼내 사실을 확정하고, 제출 전에 자소서의 주장 문장마다 근거를 물어 설명할 수
        있는지 점검해요.
      </h1>
      <div className="grid gap-4 md:grid-cols-3">
        {STEPS.map(({ stage, text }) => (
          <section
            key={stage}
            className={`block-card ${STAGES[stage].bg} min-h-[200px] justify-between`}
          >
            <h2 className="h2">{STAGES[stage].name}</h2>
            <p>{text}</p>
          </section>
        ))}
      </div>
      <section className="block-card bg-coral min-h-[200px] justify-end">
        <div className="flex flex-wrap gap-3">
          <Link to="/signup" className="btn btn-primary">
            가입하기
          </Link>
          <Link to="/login" className="btn btn-secondary">
            로그인
          </Link>
        </div>
      </section>
    </main>
  )
}
