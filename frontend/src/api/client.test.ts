import { http, HttpResponse } from 'msw'
import { api, getToken, setToken } from '@/api/client'
import { server } from '@/test/setup'

describe('api client', () => {
  it('토큰이 있으면 모든 요청에 Bearer 헤더를 붙인다', async () => {
    let header: string | null = null
    server.use(
      http.get('/api/experiences', ({ request }) => {
        header = request.headers.get('Authorization')
        return HttpResponse.json({ experiences: [] })
      }),
    )
    setToken('abc')
    await api.listExperiences()
    expect(header).toBe('Bearer abc')
  })

  it('401이면 토큰을 지운다', async () => {
    server.use(
      http.get('/api/experiences', () =>
        HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, { status: 401 }),
      ),
    )
    setToken('abc')
    await expect(api.listExperiences()).rejects.toMatchObject({ status: 401 })
    expect(getToken()).toBeNull()
  })

  it('로그인하면 받은 토큰을 저장한다', async () => {
    await api.login('seeker@example.com', 'loopthon-2026')
    expect(getToken()).toMatch(/^mock-/)
  })
})
