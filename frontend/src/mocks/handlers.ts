// docs/api.md를 따르는 목 API. 실제 서버가 붙으면 VITE_API_MOCK=false로 끈다.
import { delay, http, HttpResponse } from 'msw'
import type { Resume } from '@/api/types'
import {
  advance,
  finish,
  getDb,
  makeMainQuestions,
  newId,
  save,
  TEMPLATE,
  toQuestion,
} from '@/mocks/db'

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status })

const unauthenticated = () => fail(401, 'UNAUTHENTICATED', '로그인이 필요해요.')
const notFound = () => fail(404, 'NOT_FOUND', '찾을 수 없어요.')

function currentUser() {
  const db = getDb()
  return db.users.find((u) => u.id === db.sessionUserId) ?? null
}

const publicUser = ({ password: _password, ...user }: { password: string } & object) => user

const strip = <T extends { userId: string }>({ userId: _userId, ...rest }: T) => rest

function ownInterview(id: string) {
  const user = currentUser()
  return getDb().interviews.find((iv) => iv.id === id && iv.userId === user?.id)
}

const interviewView = (iv: NonNullable<ReturnType<typeof ownInterview>>) => {
  const { userId: _userId, result: _result, ...rest } = iv
  return rest
}

// 테스트에서는 기다리지 않는다.
const wait = (ms: number) => (import.meta.env.MODE === 'test' ? Promise.resolve() : delay(ms))

/** 0.4초짜리 짧은 소리(WAV). 목 TTS가 재생 경로를 확인할 수 있게 한다. */
function toneWav() {
  const rate = 8000
  const samples = rate * 0.4
  const buf = new ArrayBuffer(44 + samples * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples * 2, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) {
    const fade = 1 - i / samples
    v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / rate) * 8000 * fade, true)
  }
  return buf
}

export const handlers = [
  // ---- 인증 ----
  http.post('/api/auth/signup', async ({ request }) => {
    await wait(300)
    const { email, password } = (await request.json()) as { email?: string; password?: string }
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return fail(400, 'VALIDATION', '이메일 형식을 확인해 주세요.')
    if (!password || password.length < 8)
      return fail(400, 'VALIDATION', '비밀번호는 8자 이상이어야 해요.')
    const db = getDb()
    if (db.users.some((u) => u.email === email))
      return fail(409, 'EMAIL_TAKEN', '이미 가입된 이메일이에요.')
    const user = {
      id: newId(),
      email,
      password,
      role: '취준생',
      createdAt: new Date().toISOString(),
    }
    db.users.push(user)
    db.sessionUserId = user.id
    save()
    return HttpResponse.json({ user: publicUser(user) }, { status: 201 })
  }),

  http.post('/api/auth/login', async ({ request }) => {
    await wait(300)
    const { email, password } = (await request.json()) as { email?: string; password?: string }
    const db = getDb()
    const user = db.users.find((u) => u.email === email && u.password === password)
    if (!user) return fail(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 맞지 않아요.')
    db.sessionUserId = user.id
    save()
    return HttpResponse.json({ user: publicUser(user) })
  }),

  http.post('/api/auth/logout', () => {
    getDb().sessionUserId = null
    save()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/auth/me', () => {
    const user = currentUser()
    return user ? HttpResponse.json({ user: publicUser(user) }) : unauthenticated()
  }),

  // ---- 이력서 ----
  http.get('/api/resume/template', () => HttpResponse.json({ items: TEMPLATE })),

  http.get('/api/resume', async () => {
    await wait(200)
    const user = currentUser()
    if (!user) return unauthenticated()
    return HttpResponse.json({ resume: getDb().resumes[user.id] ?? null })
  }),

  http.put('/api/resume', async ({ request }) => {
    await wait(300)
    const user = currentUser()
    if (!user) return unauthenticated()
    const { items } = (await request.json()) as { items?: { key: string; content: string }[] }
    if (!items || items.length === 0)
      return fail(400, 'VALIDATION', '항목을 하나 이상 골라 주세요.')
    const keys = new Set<string>()
    for (const item of items) {
      const tpl = TEMPLATE.find((t) => t.key === item.key)
      if (!tpl || keys.has(item.key)) return fail(400, 'VALIDATION', '알 수 없는 항목이 있어요.')
      if (!item.content?.trim()) return fail(400, 'VALIDATION', `'${tpl.label}' 칸이 비어 있어요.`)
      keys.add(item.key)
    }
    const db = getDb()
    const resume: Resume = {
      id: db.resumes[user.id]?.id ?? newId(),
      items: items.map((i) => ({
        key: i.key,
        label: TEMPLATE.find((t) => t.key === i.key)!.label,
        content: i.content,
      })),
      updatedAt: new Date().toISOString(),
    }
    db.resumes[user.id] = resume
    save()
    return HttpResponse.json({ resume })
  }),

  // ---- 자기소개서 ----
  http.get('/api/cover-letters', async () => {
    await wait(200)
    const user = currentUser()
    if (!user) return unauthenticated()
    const list = getDb()
      .coverLetters.filter((c) => c.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, title, source, createdAt, updatedAt }) => ({
        id,
        title,
        source,
        createdAt,
        updatedAt,
      }))
    return HttpResponse.json({ coverLetters: list })
  }),

  http.post('/api/cover-letters/generate', async () => {
    await wait(1500)
    const user = currentUser()
    if (!user) return unauthenticated()
    const db = getDb()
    const resume = db.resumes[user.id]
    if (!resume || resume.items.length === 0)
      return fail(400, 'VALIDATION', '저장된 이력서가 없어요. 내 이력서를 먼저 채워 주세요.')
    const mine = db.coverLetters.filter((c) => c.userId === user.id)
    const time = new Date().toISOString()
    const coverLetter = {
      id: newId(),
      userId: user.id,
      title: `자기소개서 ${mine.length + 1}`,
      body: resume.items.map((i) => `[${i.label}]\n${i.content}`).join('\n\n'),
      source: 'generated' as const,
      resumeSnapshot: { items: resume.items },
      createdAt: time,
      updatedAt: time,
    }
    db.coverLetters.push(coverLetter)
    save()
    return HttpResponse.json({ coverLetter: strip(coverLetter) }, { status: 201 })
  }),

  http.post('/api/cover-letters', async ({ request }) => {
    await wait(300)
    const user = currentUser()
    if (!user) return unauthenticated()
    const { title, body } = (await request.json()) as { title?: string; body?: string }
    if (!body?.trim())
      return fail(400, 'VALIDATION', '본문이 비어 있어요. 자기소개서 글을 붙여 넣어 주세요.')
    const db = getDb()
    const mine = db.coverLetters.filter((c) => c.userId === user.id)
    const time = new Date().toISOString()
    const coverLetter = {
      id: newId(),
      userId: user.id,
      title: title?.trim() || `자기소개서 ${mine.length + 1}`,
      body,
      source: 'uploaded' as const,
      resumeSnapshot: null,
      createdAt: time,
      updatedAt: time,
    }
    db.coverLetters.push(coverLetter)
    save()
    return HttpResponse.json({ coverLetter: strip(coverLetter) }, { status: 201 })
  }),

  http.get('/api/cover-letters/:id', async ({ params }) => {
    await wait(150)
    const user = currentUser()
    if (!user) return unauthenticated()
    const found = getDb().coverLetters.find((c) => c.id === params.id && c.userId === user.id)
    return found ? HttpResponse.json({ coverLetter: strip(found) }) : notFound()
  }),

  // ---- 모의면접 ----
  http.get('/api/interviews', async () => {
    await wait(200)
    const user = currentUser()
    if (!user) return unauthenticated()
    const list = getDb()
      .interviews.filter((iv) => iv.userId === user.id)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((iv) => ({
        id: iv.id,
        coverLetterTitle: iv.coverLetterSnapshot.title,
        status: iv.status,
        startedAt: iv.startedAt,
        finishedAt: iv.finishedAt,
        endReason: iv.endReason,
      }))
    return HttpResponse.json({ interviews: list })
  }),

  http.post('/api/interviews', async ({ request }) => {
    await wait(1200)
    const user = currentUser()
    if (!user) return unauthenticated()
    const { coverLetterId } = (await request.json()) as { coverLetterId?: string }
    const db = getDb()
    const cl = db.coverLetters.find((c) => c.id === coverLetterId && c.userId === user.id)
    if (!cl) return notFound()
    const id = newId()
    const mainQuestions = makeMainQuestions(cl.body, id.slice(0, 23))
    const interview = {
      id,
      userId: user.id,
      coverLetterId: cl.id,
      coverLetterSnapshot: { title: cl.title, body: cl.body },
      status: 'in_progress' as const,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      endReason: null,
      usedFallbackQuestions: false,
      limits: { maxQuestions: 12, maxMinutes: 12, maxFollowUpsPerMain: 2 },
      mainQuestions,
      turns: [],
      currentQuestion: toQuestion(mainQuestions[0], newId()),
      result: null,
    }
    db.interviews.push(interview)
    save()
    return HttpResponse.json({ interview: interviewView(interview) }, { status: 201 })
  }),

  http.get('/api/interviews/:id', async ({ params }) => {
    await wait(150)
    if (!currentUser()) return unauthenticated()
    const iv = ownInterview(params.id as string)
    return iv ? HttpResponse.json({ interview: interviewView(iv) }) : notFound()
  }),

  http.post('/api/interviews/:id/answers', async ({ params, request }) => {
    await wait(900)
    if (!currentUser()) return unauthenticated()
    const iv = ownInterview(params.id as string)
    if (!iv) return notFound()
    if (iv.status === 'finished') return fail(409, 'INTERVIEW_FINISHED', '이미 끝난 면접이에요.')
    const input = (await request.json()) as {
      questionId: string
      text: string
      inputMode: 'voice' | 'text'
      transcriptRaw?: string
    }
    if (!input.text?.trim()) return fail(400, 'VALIDATION', '답변이 비어 있어요.')
    if (input.questionId !== iv.currentQuestion?.id)
      return fail(400, 'VALIDATION', '지금 질문에 대한 답변이 아니에요.')

    const question = iv.currentQuestion
    const followUps = iv.turns.filter(
      (t) =>
        t.question.mainQuestionId === question.mainQuestionId && t.question.kind === 'follow_up',
    ).length
    // 목 판단: 본질문의 첫 답에는 꼬리질문 1개, 그다음은 다음 본질문.
    const needsMore = question.kind === 'main' && followUps < 1
    iv.turns.push({
      question,
      answer: {
        id: newId(),
        text: input.text,
        inputMode: input.inputMode,
        transcriptRaw: input.transcriptRaw,
        answeredAt: new Date().toISOString(),
      },
      skipped: false,
      checkState: needsMore ? 'needs_more' : 'explained',
    })
    const snippet = input.text.length > 20 ? `${input.text.slice(0, 20)}…` : input.text
    const action = advance(
      iv,
      needsMore
        ? `방금 '${snippet}'라고 하셨는데, 그때 구체적으로 어떤 판단을 하셨나요?`
        : undefined,
    )
    save()
    return HttpResponse.json({ interview: interviewView(iv), next: { action } })
  }),

  http.post('/api/interviews/:id/skip', async ({ params, request }) => {
    await wait(300)
    if (!currentUser()) return unauthenticated()
    const iv = ownInterview(params.id as string)
    if (!iv) return notFound()
    if (iv.status === 'finished') return fail(409, 'INTERVIEW_FINISHED', '이미 끝난 면접이에요.')
    const { questionId } = (await request.json()) as { questionId: string }
    if (questionId !== iv.currentQuestion?.id)
      return fail(400, 'VALIDATION', '지금 질문이 아니에요.')
    iv.turns.push({ question: iv.currentQuestion, answer: null, skipped: true, checkState: null })
    const action = advance(iv)
    save()
    return HttpResponse.json({ interview: interviewView(iv), next: { action } })
  }),

  http.post('/api/interviews/:id/end', async ({ params }) => {
    await wait(800)
    if (!currentUser()) return unauthenticated()
    const iv = ownInterview(params.id as string)
    if (!iv) return notFound()
    if (iv.status !== 'finished') finish(iv, 'user_end')
    save()
    return HttpResponse.json({ interview: interviewView(iv), result: iv.result })
  }),

  http.get('/api/interviews/:id/result', async ({ params }) => {
    await wait(200)
    if (!currentUser()) return unauthenticated()
    const iv = ownInterview(params.id as string)
    if (!iv) return notFound()
    if (iv.status !== 'finished' || !iv.result)
      return fail(409, 'INTERVIEW_IN_PROGRESS', '아직 진행 중인 면접이에요.')
    return HttpResponse.json({ result: iv.result })
  }),

  http.post('/api/interviews/:id/suggestions/:sid/:decision', async ({ params }) => {
    await wait(300)
    if (!currentUser()) return unauthenticated()
    const iv = ownInterview(params.id as string)
    const suggestion = iv?.result?.suggestions.find((s) => s.id === params.sid)
    if (!iv || !suggestion) return notFound()
    if (params.decision === 'reject') {
      suggestion.status = 'rejected'
      save()
      return HttpResponse.json({ suggestion })
    }
    const db = getDb()
    const cl = db.coverLetters.find((c) => c.id === iv.coverLetterId)
    if (!cl || !cl.body.includes(suggestion.original))
      return fail(409, 'VALIDATION', '자기소개서 원문이 바뀌어 이 제안을 반영할 수 없어요.')
    cl.body = cl.body.replace(suggestion.original, suggestion.proposed)
    cl.updatedAt = new Date().toISOString()
    suggestion.status = 'accepted'
    save()
    return HttpResponse.json({ suggestion, coverLetter: strip(cl) })
  }),

  // ---- 음성 ----
  http.post('/api/speech/transcribe', async ({ request }) => {
    await wait(1000)
    if (!currentUser()) return unauthenticated()
    const form = await request.formData()
    const audio = form.get('audio')
    if (!(audio instanceof Blob) || audio.size < 2000)
      return fail(400, 'EMPTY_TRANSCRIPT', '목소리를 알아듣지 못했어요. 다시 말해 주세요.')
    return HttpResponse.json({
      text: '(목 전사) 제가 직접 서버 로그를 확인해서 세션 만료 설정이 원인이라는 걸 찾았습니다.',
    })
  }),

  http.get('/api/speech/tts', async () => {
    await wait(300)
    if (!currentUser()) return unauthenticated()
    return new HttpResponse(toneWav(), { headers: { 'Content-Type': 'audio/wav' } })
  }),
]
