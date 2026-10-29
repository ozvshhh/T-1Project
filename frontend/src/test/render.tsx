import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { AuthProvider } from '@/auth/AuthProvider'
import { getDb, save } from '@/mocks/db'

/** 앱 전체를 path에서 연다. loggedIn이면 시드 계정으로 로그인된 상태. */
export function renderApp(path: string, { loggedIn = false } = {}) {
  if (loggedIn) {
    const db = getDb()
    db.sessionUserId = db.users[0].id
    save()
  }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}
