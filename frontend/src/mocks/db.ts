// 백엔드가 붙기 전까지 쓰는 목 데이터. docs/api.md 10절 시드와 같은 모양으로 시작한다.
// 새로고침해도 남도록 localStorage에 둔다(실제 서버의 DB 역할).
import type {
  CoverLetter,
  EndReason,
  InterviewSession,
  MainQuestion,
  Question,
  Result,
  Resume,
  ResumeTemplateItem,
  User,
} from '@/api/types'

export const SEED_USER = { email: 'seed@t1.test', password: 'seedpass1234' }

export const TEMPLATE: ResumeTemplateItem[] = [
  { key: 'intro_1min', label: '1분 자기소개' },
  { key: 'job_success', label: '직무 관련 성공경험' },
  { key: 'job_preparation', label: '직무를 위해 준비한 사항' },
  { key: 'motivation', label: '지원동기' },
  { key: 'aspiration', label: '입사 후 포부' },
  { key: 'personality', label: '성격의 장단점' },
  { key: 'crisis', label: '위기 극복 경험' },
  { key: 'growth', label: '성장과정' },
  { key: 'teamwork', label: '팀워크 및 협업경험' },
]

type StoredUser = User & { password: string }
type StoredCoverLetter = CoverLetter & { userId: string }
type StoredInterview = InterviewSession & { userId: string; result: Result | null }

type Db = {
  users: StoredUser[]
  sessionUserId: string | null
  resumes: Record<string, Resume>
  coverLetters: StoredCoverLetter[]
  interviews: StoredInterview[]
  seq: number
}

const STORAGE_KEY = 't1-mock-db'
// 처음 쓸 때 만든다(아래 시드 상수가 먼저 준비돼야 해서).
let db: Db | null = null

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    // 저장소를 못 쓰면 메모리로만 돈다.
  }
  return seed()
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getDb()))
  } catch {
    // 위와 같음
  }
}

export function resetDb() {
  db = seed()
  save()
}

export function getDb(): Db {
  db ??= load()
  return db
}

export function newId() {
  const d = getDb()
  d.seq += 1
  return d.seq.toString(16).padStart(24, '0')
}

const now = () => new Date().toISOString()

export const INTERVIEWER_LABEL = { practical: '실무 면접관', executive: '임원 면접관' } as const

const SEED_BODY = [
  '저는 동아리 웹사이트의 로그인 오류를 직접 찾아 고친 경험이 있습니다.',
  '회원들이 자주 로그아웃된다는 제보를 받고 서버 로그를 하나씩 확인했습니다.',
  '해커톤에서는 4명과 역할을 나눠 48시간 안에 서비스를 완성했습니다.',
  '이 경험으로 문제를 끝까지 추적하는 습관을 길렀습니다.',
].join('\n')

function seed(): Db {
  const created = '2026-10-28T09:00:00.000Z'
  const user: StoredUser = {
    id: '000000000000000000000001',
    email: SEED_USER.email,
    password: SEED_USER.password,
    role: '취준생',
    createdAt: created,
  }
  const resume: Resume = {
    id: '000000000000000000000002',
    items: [
      {
        key: 'job_success',
        label: '직무 관련 성공경험',
        content: '동아리 웹사이트 로그인 오류를 찾아 고쳤다',
      },
      {
        key: 'teamwork',
        label: '팀워크 및 협업경험',
        content: '해커톤에서 4명과 역할을 나눠 48시간 안에 완성했다',
      },
    ],
    updatedAt: created,
  }
  const coverLetter: StoredCoverLetter = {
    id: '000000000000000000000003',
    userId: user.id,
    title: '시드 자기소개서',
    body: SEED_BODY,
    source: 'uploaded',
    resumeSnapshot: null,
    createdAt: created,
    updatedAt: created,
  }

  const mains = makeMainQuestions(SEED_BODY, '00000000000000000000001')
  const ask = (m: MainQuestion, at: string): Question => toQuestion(m, `${m.id}q`, at)
  const interview: StoredInterview = {
    id: '000000000000000000000004',
    userId: user.id,
    coverLetterId: coverLetter.id,
    coverLetterSnapshot: { title: coverLetter.title, body: coverLetter.body },
    status: 'finished',
    startedAt: '2026-10-28T10:00:00.000Z',
    finishedAt: '2026-10-28T10:06:00.000Z',
    endReason: 'user_end',
    usedFallbackQuestions: false,
    limits: { maxQuestions: 12, maxMinutes: 12, maxFollowUpsPerMain: 2 },
    mainQuestions: mains,
    currentQuestion: null,
    turns: [
      {
        question: ask(mains[0], '2026-10-28T10:00:10.000Z'),
        answer: {
          id: '00000000000000000000a001',
          text: '서버 로그에서 세션 만료 시간이 너무 짧게 잡힌 걸 찾아 설정을 고쳤습니다.',
          inputMode: 'text',
          answeredAt: '2026-10-28T10:02:00.000Z',
        },
        skipped: false,
        checkState: 'explained',
      },
      {
        question: ask(mains[1], '2026-10-28T10:02:10.000Z'),
        answer: {
          id: '00000000000000000000a002',
          text: '팀에서 프론트엔드를 맡았고, 마감 전날 화면 연결을 끝까지 책임졌습니다.',
          inputMode: 'text',
          answeredAt: '2026-10-28T10:05:00.000Z',
        },
        skipped: false,
        checkState: 'needs_more',
      },
    ],
    result: null,
  }
  interview.result = buildResult(interview)

  return {
    users: [user],
    sessionUserId: null,
    resumes: { [user.id]: resume },
    coverLetters: [coverLetter],
    interviews: [interview],
    seq: 0x100,
  }
}

// ---- 모의면접 진행(실제 서버의 AI 판단을 흉내 낸다) ----

function sentencesOf(body: string) {
  const parts = body
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    // 생성 초안의 '[항목 이름]' 머리글 줄은 문장이 아니다.
    .filter((s) => s.length > 8 && !/^\[.*\]$/.test(s))
  return parts.length > 0 ? parts : [body.trim()]
}

const clip = (s: string, n = 36) => (s.length > n ? `${s.slice(0, n)}…` : s)

export function makeMainQuestions(body: string, idPrefix: string): MainQuestion[] {
  const s = sentencesOf(body)
  const pick = (i: number) => s[i % s.length]
  const drafts: Omit<MainQuestion, 'id' | 'order'>[] = [
    {
      interviewer: 'practical',
      purpose: '본인이 직접 한 행동 확인',
      basisSentence: pick(0),
      text: `'${clip(pick(0))}'라고 쓰셨는데, 그때 본인이 직접 한 일은 무엇이었나요?`,
    },
    {
      interviewer: 'practical',
      purpose: '선택한 이유 확인',
      basisSentence: pick(1),
      text: `'${clip(pick(1))}' 과정에서 다른 방법도 있었을 텐데, 왜 그 방법을 골랐나요?`,
    },
    {
      interviewer: 'executive',
      purpose: '기여도 확인',
      basisSentence: pick(2),
      text: `'${clip(pick(2))}' 경험에서 본인을 빼도 결과가 같지 않았을까요?`,
    },
    {
      interviewer: 'executive',
      purpose: '결과 확인',
      basisSentence: pick(3),
      text: `'${clip(pick(3))}'라고 하셨는데, 그 결과는 무엇으로 확인했나요?`,
    },
  ]
  // 순서는 세션을 만들 때 한 번 섞어서 저장한다(F5).
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5)
  return order.map((d, i) => ({ ...drafts[d], id: `${idPrefix}${i}`, order: i }))
}

export function toQuestion(
  m: MainQuestion,
  id: string,
  askedAt = now(),
  followUp?: string,
): Question {
  return {
    id,
    kind: followUp ? 'follow_up' : 'main',
    mainQuestionId: m.id,
    interviewer: m.interviewer,
    interviewerLabel: INTERVIEWER_LABEL[m.interviewer],
    purpose: followUp ? '방금 답변 구체화' : m.purpose,
    text: followUp ?? m.text,
    askedAt,
  }
}

export function asked(iv: InterviewSession) {
  return iv.turns.length + (iv.currentQuestion ? 1 : 0)
}

/** 다음 질문으로 넘기거나 끝낸다. 끝나면 결과를 만든다. */
export function advance(iv: StoredInterview, followUp?: string) {
  const current = iv.currentQuestion
  const mains = [...iv.mainQuestions].sort((a, b) => a.order - b.order)
  const elapsedMin = (Date.now() - Date.parse(iv.startedAt)) / 60000

  let reason: EndReason | null = null
  if (iv.turns.length >= iv.limits.maxQuestions) reason = 'question_limit'
  else if (elapsedMin >= iv.limits.maxMinutes) reason = 'time_limit'

  if (!reason && followUp && current) {
    const main = mains.find((m) => m.id === current.mainQuestionId)!
    iv.currentQuestion = toQuestion(main, newId(), now(), followUp)
    return 'follow_up' as const
  }
  if (!reason) {
    const idx = mains.findIndex((m) => m.id === current?.mainQuestionId)
    const nextMain = mains[idx + 1]
    if (nextMain) {
      iv.currentQuestion = toQuestion(nextMain, newId())
      return 'next_main' as const
    }
    reason = 'all_done'
  }
  finish(iv, reason)
  return 'finished' as const
}

export function finish(iv: StoredInterview, reason: EndReason) {
  iv.status = 'finished'
  iv.endReason = reason
  iv.finishedAt = now()
  iv.currentQuestion = null
  iv.result = buildResult(iv)
}

function buildResult(iv: InterviewSession): Result {
  const answered = iv.turns.filter((t) => t.answer)
  const fields = ['role', 'reason', 'result'] as const
  const firstSentence = sentencesOf(iv.coverLetterSnapshot.body)[0]
  return {
    interviewId: iv.id,
    transcript: iv.turns,
    clarifiedExperiences: answered.slice(0, 3).map((t, i) => ({
      field: fields[i],
      text: t.answer!.text,
      basisAnswerId: t.answer!.id,
    })),
    openItems: iv.turns
      .filter((t) => t.skipped || t.checkState !== 'explained')
      .slice(0, 3)
      .map((t) => ({
        text: t.skipped
          ? `'${clip(t.question.text, 28)}'에 아직 답하지 않았어요.`
          : `${t.question.purpose}: 숫자나 결과로 더 구체적으로 말해 보세요.`,
        basisQuestionId: t.question.id,
      })),
    suggestions: firstSentence
      ? [
          {
            id: `${iv.id.slice(0, 20)}s001`,
            original: firstSentence,
            proposed: `${firstSentence.replace(/[.。]$/, '')}. ${answered[0]?.answer?.text ?? '이때 제가 맡은 역할과 결과를 구체적으로 적었습니다.'}`,
            why: '면접 답변에서 새로 설명한 원인과 결과를 문장에 넣으면 기여도가 드러나요.',
            status: 'pending',
          },
        ]
      : [],
    resultStatus: 'complete',
  }
}
