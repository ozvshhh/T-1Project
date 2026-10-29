import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/context'

// 상단 메뉴 글자는 docs/scenarios.yaml과 글자 하나까지 같아야 한다(E2E가 이 글자로 찾는다).
// 진행 화면(/interviews/:id)은 '모의면접', 목록·결과는 '면접 기록'에 속한다.
const MENU = [
  { to: '/resume', label: '내 이력서', match: (p: string) => p.startsWith('/resume') },
  {
    to: '/cover-letters',
    label: '내 자기소개서',
    match: (p: string) => p.startsWith('/cover-letters'),
  },
  {
    to: '/interview',
    label: '모의면접',
    match: (p: string) => p === '/interview' || /^\/interviews\/[^/]+$/.test(p),
  },
  {
    to: '/interviews',
    label: '면접 기록',
    match: (p: string) => p === '/interviews' || p.endsWith('/result'),
  },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen pb-16">
      <header className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
        <Link to="/" className="flex min-h-[44px] items-center text-lg font-bold">
          T-1Project
        </Link>
        {user && (
          <nav aria-label="주요 메뉴" className="flex flex-wrap gap-x-[26px] text-[15px]">
            {MENU.map((m) => {
              const active = m.match(pathname)
              return (
                <Link
                  key={m.to}
                  to={m.to}
                  aria-current={active ? 'page' : undefined}
                  className={`py-3 ${active ? 'underline decoration-2 underline-offset-8' : ''}`}
                >
                  {m.label}
                </Link>
              )
            })}
          </nav>
        )}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-[15px]">{user.email}</span>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={async () => {
                  await logout()
                  navigate('/')
                }}
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-sm btn-secondary">
              로그인
            </Link>
          )}
        </div>
      </header>
      <Outlet />
    </div>
  )
}
