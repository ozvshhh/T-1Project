import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { resetDb } from '@/mocks/db'
import { handlers } from '@/mocks/handlers'

// 테스트도 개발 서버와 같은 목 API(docs/api.md 형태)로 돈다.
const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => resetDb())
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
