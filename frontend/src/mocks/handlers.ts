// docs/api.md를 따르는 목 API. 실제 서버가 붙으면 VITE_API_MOCK=false로 끈다.
// 3·4·5번 작업에서 경험·자소서·점검 경로를 더한다.
import { delay, http, HttpResponse } from 'msw'
import { getDb, newId, save, tokenFor, userFromToken } from '@/mocks/db'

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status })

const wait = (ms: number) => delay(import.meta.env.MODE === 'test' ? 0 : ms)

const publicUser = (u: { id: string; email: string }) => ({ id: u.id, email: u.email })

export const handlers = [
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
    if (!user) return fail(401, 'UNAUTHENTICATED', '로그인이 필요해요.')
    return HttpResponse.json({ user: publicUser(user) })
  }),
]
