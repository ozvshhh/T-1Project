import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/context'
import { CheckMark } from '@/components/CheckMark'

// 서비스 이름·설명 문구는 [학생 답 대기]. 확정 전까지 'T-1Project'를 임시 이름으로 쓴다.
// 단계 카드 안 미리보기는 실제 화면 모양을 줄여 보여 준다. 문장은 시드 자기소개서에서 가져왔다.
const SAMPLE_SENTENCE = '회원들이 자주 로그아웃된다는 제보를 받고 서버 로그를 하나씩 확인했습니다.'

const STEPS = [
  {
    tone: 'bg-lime',
    label: '01 이력서',
    title: '9개 항목 중 골라서 내 경험을 적어요',
    preview: (
      <div className="flex flex-col gap-2">
        <span className="row items-center">
          직무 관련 성공경험 <CheckMark />
        </span>
        <span className="row items-center">
          팀워크 및 협업경험 <CheckMark />
        </span>
        <span className="row row-pending">위기 극복 경험</span>
      </div>
    ),
  },
  {
    tone: 'bg-lilac',
    label: '02 자기소개서',
    title: '이력서로 초안을 만들거나 이미 쓴 글을 등록해요',
    preview: (
      <div className="inner-card text-[15px] leading-[1.7]">
        <p className="meta mb-2">시드 자기소개서</p>
        <p>
          저는 동아리 웹사이트의 로그인 오류를 직접 찾아 고친 경험이 있습니다.{' '}
          <mark className="bg-lilac/60 decoration-ink underline decoration-2 underline-offset-4">
            {SAMPLE_SENTENCE}
          </mark>
        </p>
      </div>
    ),
  },
  {
    tone: 'bg-cream',
    label: '03 음성 모의면접',
    title: '실무·임원 면접관이 내 자기소개서에서 꼬리질문을 던져요',
    preview: (
      <div className="rounded-card bg-ink text-ink-inverse p-[18px] text-[15px] leading-[1.6]">
        <p className="text-[13px]">
          <span className="text-cream">실무 면접관</span> · 꼬리질문
        </p>
        <p className="mt-2">그 과정에서 다른 방법도 있었을 텐데, 왜 그 방법을 골랐나요?</p>
        <p className="border-hairline mt-3 border-t pt-2 text-[13px]">
          <span className="text-lilac">근거</span> 서버 로그를 하나씩 확인했습니다.
        </p>
      </div>
    ),
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
      {/* 이름은 왼쪽에 크게, 설명과 버튼은 오른쪽 아래에 붙여 넓은 화면의 빈 오른쪽을 채운다. */}
      <section className="wrap grid items-end gap-x-12 gap-y-8 pt-20 lg:grid-cols-[1fr_440px]">
        <div>
          <p className="label mb-5">대화형 자기소개서 · 압박 면접 훈련</p>
          <h1 className="display">T-1Project</h1>
        </div>
        <div className="lg:pb-3">
          <p className="text-xl leading-[1.6] tracking-[-0.01em]">
            내 경험으로 자기소개서를 만들고, 그 자기소개서의 빈틈을 파고드는 음성 모의면접으로
            실전에서 말할 준비를 해요.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link to="/signup" className="btn btn-primary">
              회원가입
            </Link>
            <Link to="/login" className="btn btn-secondary">
              로그인
            </Link>
          </div>
        </div>
      </section>

      <section className="wrap pt-14" aria-label="세 단계">
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
              {step.preview}
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
