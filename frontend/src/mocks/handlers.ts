// docs/api.md를 따르는 목 API. 실제 서버가 붙으면 VITE_API_MOCK=false로 끈다.
// AI 결과는 specs/mock-data.md 「AI 고정 동작」대로 고정한다. 4·5번 작업에서 자소서·점검 경로를 더한다.
import { delay, http, HttpResponse } from 'msw'
import type { Fact, FactSource, Item, Message } from '@/api/types'
import {
  emptyCard,
  emptyStatus,
  getDb,
  getFile,
  ITEM_QUESTIONS,
  ITEMS,
  newId,
  now,
  save,
  saveFile,
  type StoredExperience,
  toExperience,
  tokenFor,
  userFromToken,
} from '@/mocks/db'

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status })

const wait = (ms: number) => delay(import.meta.env.MODE === 'test' ? 0 : ms)
// AI를 부르는 목 경로는 응답 전에 800ms 기다린다(mock-data.md).
const AI_DELAY = 800

const publicUser = (u: { id: string; email: string }) => ({ id: u.id, email: u.email })

const unauthenticated = () => fail(401, 'UNAUTHENTICATED', '로그인이 필요해요.')
const notFound = () => fail(404, 'NOT_FOUND', '찾을 수 없어요.')
const invalid = (field: string, reason: string) =>
  HttpResponse.json(
    { error: { code: 'VALIDATION', message: '입력을 확인해 주세요.', details: [{ field, reason }] } },
    { status: 400 },
  )

const isItem = (value: unknown): value is Item => ITEMS.includes(value as Item)
const isFactSource = (value: unknown): value is FactSource => value === 'said' || value === 'clue'
const isBlank = (value: unknown) => typeof value !== 'string' || value.trim() === ''

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null)
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

/** 토큰의 계정이 가진 경험. 다른 계정의 것이면 null(→ 404, api.md 1절). */
function findExperience(request: Request, id: string) {
  const user = userFromToken(request.headers.get('Authorization'))
  if (!user) return { user: null, experience: null }
  const experience = getDb().experiences.find((e) => e.id === id && e.userId === user.id) ?? null
  return { user, experience }
}

function touch(experience: StoredExperience) {
  experience.updatedAt = now()
  save()
}

/** 출처가 clue면 이 경험의 단서 id가 있어야 한다. 문제가 있으면 오류 응답을 돌려준다. */
function checkClue(experience: StoredExperience, source: FactSource, clueId: unknown) {
  if (source !== 'clue') return null
  if (typeof clueId !== 'string' || !experience.clues.some((c) => c.id === clueId))
    return invalid('clueId', '이 경험의 단서를 골라 주세요.')
  return null
}

function removeFact(experience: StoredExperience, factId: string): Fact | null {
  const candidateIndex = experience.candidates.findIndex((f) => f.id === factId)
  if (candidateIndex >= 0) return experience.candidates.splice(candidateIndex, 1)[0]
  for (const item of ITEMS) {
    const index = experience.card[item].findIndex((f) => f.id === factId)
    if (index >= 0) return experience.card[item].splice(index, 1)[0]
  }
  return null
}

const authHandlers = [
  http.post('/api/auth/signup', async ({ request }) => {
    await wait(300)
    const { email, password } = (await request.json()) as { email?: string; password?: string }
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password)
      return fail(400, 'VALIDATION', '이메일과 비밀번호를 확인해 주세요.')
    const db = getDb()
    if (db.users.some((u) => u.email === email))
      return fail(409, 'EMAIL_TAKEN', '이미 가입된 이메일이에요.')
    const user = { id: newId(), email, password }
    db.users.push(user)
    save()
    return HttpResponse.json({ token: tokenFor(user.id), user: publicUser(user) }, { status: 201 })
  }),

  http.post('/api/auth/login', async ({ request }) => {
    await wait(300)
    const { email, password } = (await request.json()) as { email?: string; password?: string }
    const user = getDb().users.find((u) => u.email === email && u.password === password)
    if (!user) return fail(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 맞지 않아요.')
    return HttpResponse.json({ token: tokenFor(user.id), user: publicUser(user) })
  }),

  http.get('/api/auth/me', ({ request }) => {
    const user = userFromToken(request.headers.get('Authorization'))
    if (!user) return unauthenticated()
    return HttpResponse.json({ user: publicUser(user) })
  }),
]

// api.md 4절
const experienceHandlers = [
  http.post('/api/experiences', async ({ request }) => {
    const user = userFromToken(request.headers.get('Authorization'))
    if (!user) return unauthenticated()
    const { title, period } = await readJson(request)
    if (isBlank(title)) return invalid('title', '필수 입력이에요.')
    if (isBlank(period)) return invalid('period', '필수 입력이에요.')
    const at = now()
    const experience: StoredExperience = {
      id: newId(),
      userId: user.id,
      title: (title as string).trim(),
      period: (period as string).trim(),
      clues: [],
      itemStatus: emptyStatus(),
      card: emptyCard(),
      candidates: [],
      messages: [],
      createdAt: at,
      updatedAt: at,
    }
    getDb().experiences.push(experience)
    save()
    return HttpResponse.json({ experience: toExperience(experience) }, { status: 201 })
  }),

  http.get('/api/experiences', ({ request }) => {
    const user = userFromToken(request.headers.get('Authorization'))
    if (!user) return unauthenticated()
    const experiences = getDb()
      .experiences.filter((e) => e.userId === user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toExperience)
    return HttpResponse.json({ experiences })
  }),

  http.get<{ id: string }>('/api/experiences/:id', ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    return HttpResponse.json({ experience: toExperience(experience) })
  }),

  http.patch<{ id: string }>('/api/experiences/:id', async ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    const { title, period } = await readJson(request)
    if (title !== undefined && isBlank(title)) return invalid('title', '필수 입력이에요.')
    if (period !== undefined && isBlank(period)) return invalid('period', '필수 입력이에요.')
    if (typeof title === 'string') experience.title = title.trim()
    if (typeof period === 'string') experience.period = period.trim()
    touch(experience)
    return HttpResponse.json({ experience: toExperience(experience) })
  }),

  http.post<{ id: string }>('/api/experiences/:id/clues', async ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    const id = newId()
    const createdAt = now()

    if (request.headers.get('Content-Type')?.includes('multipart/form-data')) {
      const form = await request.formData()
      const type = form.get('type')
      const file = form.get('file')
      const description = form.get('description')
      if (type !== 'photo' && type !== 'award' && type !== 'document')
        return invalid('type', '단서 종류를 골라 주세요.')
      if (!(file instanceof File)) return invalid('file', '파일을 골라 주세요.')
      saveFile(id, file)
      const clue = {
        id,
        type,
        description: typeof description === 'string' && description.trim() ? description : null,
        text: null,
        fileName: file.name,
        createdAt,
      } as const
      experience.clues.push(clue)
      touch(experience)
      return HttpResponse.json({ clue }, { status: 201 })
    }

    const { type, text } = await readJson(request)
    if (type !== 'text') return invalid('type', '단서 종류를 골라 주세요.')
    if (isBlank(text)) return invalid('text', '필수 입력이에요.')
    const clue = {
      id,
      type,
      description: null,
      text: text as string,
      fileName: null,
      createdAt,
    } as const
    experience.clues.push(clue)
    touch(experience)
    return HttpResponse.json({ clue }, { status: 201 })
  }),

  http.get<{ id: string; clueId: string }>(
    '/api/experiences/:id/clues/:clueId/file',
    ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      const file = experience?.clues.some((c) => c.id === params.clueId)
        ? getFile(params.clueId)
        : null
      if (!file) return notFound()
      return new HttpResponse(file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
    },
  ),
]

// api.md 5절. 질문·상태·후보는 mock-data.md 「경험 대화」 고정 동작.
const conversationHandlers = [
  http.get<{ id: string }>('/api/experiences/:id/conversation', ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    return HttpResponse.json({
      messages: experience.messages,
      itemStatus: experience.itemStatus,
      candidates: experience.candidates,
    })
  }),

  http.post<{ id: string }>('/api/experiences/:id/conversation/start', async ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    await wait(AI_DELAY)
    // 이미 대화가 있으면 마지막 AI 질문을 돌려준다(대화 이어가기).
    const lastQuestion = experience.messages.findLast((m) => m.role === 'ai')
    if (lastQuestion)
      return HttpResponse.json({ question: lastQuestion, itemStatus: experience.itemStatus })
    const question: Message = { role: 'ai', text: ITEM_QUESTIONS.situation, createdAt: now() }
    experience.messages.push(question)
    touch(experience)
    return HttpResponse.json({ question, itemStatus: experience.itemStatus })
  }),

  http.post<{ id: string }>(
    '/api/experiences/:id/conversation/answers',
    async ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      if (!experience) return notFound()
      const { text } = await readJson(request)
      if (isBlank(text)) return invalid('text', '답변을 입력해 주세요.')
      if (experience.messages.length === 0)
        return fail(409, 'CONVERSATION_NOT_STARTED', '대화를 먼저 시작해 주세요.')
      await wait(AI_DELAY)

      // 아직 explained가 아닌 첫 항목을 explained로 바꾸고, 그 다음 항목을 묻는다.
      // 다섯 항목이 모두 explained면 마지막 항목(의의)의 답으로 보고 같은 질문을 다시 낸다.
      const answered = ITEMS.find((item) => experience.itemStatus[item] !== 'explained') ?? 'meaning'
      experience.itemStatus = { ...experience.itemStatus, [answered]: 'explained' }
      const next = ITEMS.find((item) => experience.itemStatus[item] !== 'explained') ?? 'meaning'

      const answer: Message = { role: 'user', text: text as string, createdAt: now() }
      const question: Message = { role: 'ai', text: ITEM_QUESTIONS[next], createdAt: now() }
      const candidate: Fact = {
        id: newId(),
        item: answered,
        text: text as string,
        status: 'candidate',
        source: 'ai_unverified',
        clueId: null,
        origin: 'conversation',
        createdAt: answer.createdAt,
      }
      experience.messages.push(answer, question)
      experience.candidates.push(candidate)
      touch(experience)
      return HttpResponse.json({
        answer,
        question,
        itemStatus: experience.itemStatus,
        newCandidates: [candidate],
      })
    },
  ),
]

// api.md 6절
const factHandlers = [
  http.post<{ id: string; factId: string }>(
    '/api/experiences/:id/facts/:factId/confirm',
    async ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      if (!experience) return notFound()
      const candidate = experience.candidates.find((f) => f.id === params.factId)
      if (!candidate) return notFound()
      const { text, item, source, clueId } = await readJson(request)
      // 확인하지 않은 것은 사실이 되지 않는다(C1): ai_unverified는 받지 않는다.
      if (!isFactSource(source)) return invalid('source', '내가 말함 또는 자료로 확인을 골라 주세요.')
      if (text !== undefined && isBlank(text)) return invalid('text', '필수 입력이에요.')
      if (item !== undefined && !isItem(item)) return invalid('item', '항목을 골라 주세요.')
      const clueError = checkClue(experience, source, clueId)
      if (clueError) return clueError

      removeFact(experience, candidate.id)
      const fact: Fact = {
        ...candidate,
        text: typeof text === 'string' ? text.trim() : candidate.text,
        item: isItem(item) ? item : candidate.item,
        status: 'confirmed',
        source,
        clueId: source === 'clue' ? (clueId as string) : null,
      }
      experience.card[fact.item].push(fact)
      touch(experience)
      return HttpResponse.json({ fact })
    },
  ),

  http.patch<{ id: string; factId: string }>(
    '/api/experiences/:id/facts/:factId',
    async ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      if (!experience) return notFound()
      const { text, item, source, clueId } = await readJson(request)
      if (text !== undefined && isBlank(text)) return invalid('text', '필수 입력이에요.')
      if (item !== undefined && !isItem(item)) return invalid('item', '항목을 골라 주세요.')
      if (source !== undefined && !isFactSource(source))
        return invalid('source', '내가 말함 또는 자료로 확인을 골라 주세요.')
      if (isFactSource(source)) {
        const clueError = checkClue(experience, source, clueId)
        if (clueError) return clueError
      }

      const fact =
        experience.candidates.find((f) => f.id === params.factId) ??
        ITEMS.flatMap((i) => experience.card[i]).find((f) => f.id === params.factId)
      if (!fact) return notFound()
      if (typeof text === 'string') fact.text = text.trim()
      // 후보의 출처는 확정할 때만 정한다(C1). 후보 고치기는 내용·항목만 바꾼다.
      if (fact.status === 'confirmed' && isFactSource(source)) {
        fact.source = source
        fact.clueId = source === 'clue' ? (clueId as string) : null
      }
      if (isItem(item) && item !== fact.item) {
        if (fact.status === 'confirmed') {
          removeFact(experience, fact.id)
          experience.card[item].push(fact)
        }
        fact.item = item
      }
      touch(experience)
      return HttpResponse.json({ fact })
    },
  ),

  http.delete<{ id: string; factId: string }>(
    '/api/experiences/:id/facts/:factId',
    ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      if (!experience) return notFound()
      if (!removeFact(experience, params.factId)) return notFound()
      touch(experience)
      return new HttpResponse(null, { status: 204 })
    },
  ),

  http.post<{ id: string }>('/api/experiences/:id/facts', async ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    const { item, text, source, clueId } = await readJson(request)
    if (!isItem(item)) return invalid('item', '항목을 골라 주세요.')
    if (isBlank(text)) return invalid('text', '필수 입력이에요.')
    if (!isFactSource(source)) return invalid('source', '내가 말함 또는 자료로 확인을 골라 주세요.')
    const clueError = checkClue(experience, source, clueId)
    if (clueError) return clueError
    // 사용자가 직접 쓴 것이므로 바로 확정한다.
    const fact: Fact = {
      id: newId(),
      item,
      text: (text as string).trim(),
      status: 'confirmed',
      source,
      clueId: source === 'clue' ? (clueId as string) : null,
      origin: 'manual',
      createdAt: now(),
    }
    experience.card[item].push(fact)
    touch(experience)
    return HttpResponse.json({ fact }, { status: 201 })
  }),
]

export const handlers = [
  ...authHandlers,
  ...experienceHandlers,
  ...conversationHandlers,
  ...factHandlers,
]
