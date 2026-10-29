import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/context'

// 서비스 이름·설명 문구는 [학생 답 대기]. 확정 전까지 'T-1Project'를 임시 이름으로 쓴다.
const STEPS = [
  {
    tone: 'bg-lime',
    label: '01 이력서',
    title: '9개 항목 중 골라서 내 경험을 적어요',
    rows: ['직무 관련 성공경험', '팀워크 및 협업경험', '위기 극복 경험'],
  },
  {
    tone: 'bg-lilac',
    label: '02 자기소개서',
    title: '이력서로 초안을 만들거나 이미 쓴 글을 등록해요',
    rows: ['이력서로 초안 만들기', '자기소개서 등록'],
  },
  {
    tone: 'bg-cream',
    label: '03 음성 모의면접',
    title: '실무·임원 면접관이 내 자기소개서에서 꼬리질문을 던져요',
    rows: ['실무 면접관', '임원 면접관'],
  },
]

const PRINCIPLES = [
  {
    tone: 'text-lime',
    key: '내 자기소개서에서',
    value: '뻔한 질문 대신 내가 쓴 문장의 빈틈을 묻습니다.',
  },
  {
    tone: 'text-pink',
    key: '말로 답하기',
    value: '외운 대본이 아니라 내 행동을 바로 말로 꺼내 봅니다.',
  },
  {
    tone: 'text-lilac',
    key: '점수 대신 보완',
    value: '끝나면 보완할 항목과 자기소개서 수정 제안을 줍니다.',
  },
]

export default function Home() {
  const { user, ready } = useAuth()
  if (ready && user) return <Navigate to="/resume" replace />

  return (
    <main>
      <section className="wrap pt-16">
        <p className="label mb-5">대화형 자기소개서 · 압박 면접 훈련</p>
        <h1 className="display max-w-[1080px]">T-1Project</h1>
        <p className="mt-7 max-w-[560px] text-xl leading-normal">
          내 경험으로 자기소개서를 만들고, 그 자기소개서의 빈틈을 파고드는 음성 모의면접으로
          실전에서 말할 준비를 해요.
        </p>
        <div className="mt-8 flex flex-wrap gap-2.5">
          <Link to="/signup" className="btn btn-primary">
            회원가입
          </Link>
          <Link to="/login" className="btn btn-secondary">
            로그인
          </Link>
        </div>
      </section>

      <section className="wrap pt-16" aria-label="세 단계">
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          {STEPS.map((step) => (
            <li
              key={step.label}
              className={`block-card min-h-[380px] justify-between ${step.tone}`}
            >
              <div>
                <p className="label">{step.label}</p>
                <p className="card-title mt-2">{step.title}</p>
              </div>
              <div className="flex flex-col gap-2">
                {step.rows.map((row) => (
                  <span key={row} className="row">
                    {row}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="wrap pt-6">
        <div className="rounded-block bg-ink text-ink-inverse p-[clamp(32px,6vw,72px)]">
          <h2 className="h1">
            면접장에서 머리가 하얘지는 건,
            <br />
            외운 답이 막히기 때문이에요.
          </h2>
          <div className="border-hairline mt-12 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] border-t">
            {PRINCIPLES.map((p) => (
              <div key={p.key} className="pt-6 pr-6 pb-2">
                <p className={`text-[15px] ${p.tone}`}>{p.key}</p>
                <p className="mt-2 text-xl leading-[1.45]">{p.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
