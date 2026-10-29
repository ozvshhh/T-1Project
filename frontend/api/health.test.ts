import { GET } from './health'

describe('GET /__health', () => {
  it('200 과 no-store, releaseId 를 응답한다', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123')
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Type')).toContain('application/json')
    expect(await res.json()).toEqual({ releaseId: 'abc123' })
    vi.unstubAllEnvs()
  })
})
