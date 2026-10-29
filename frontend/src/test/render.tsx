import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { setToken } from '@/api/client'
import { AuthProvider } from '@/auth/AuthProvider'
import { getDb, tokenFor } from '@/mocks/db'

/** 앱 전체를 path에서 연다. loggedIn이면 시드 계정의 토큰을 localStorage에 둔 상태. */
export function renderApp(path: string, { loggedIn = false } = {}) {
  if (loggedIn) setToken(tokenFor(getDb().users[0].id))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}
