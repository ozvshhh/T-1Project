import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/context'

const MENU = [
  { to: '/cover-letters', label: '자소서' },
  { to: '/experiences', label: '경험' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen pb-16">
      <header className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
        <Link to="/" className="flex min-h-[44px] items-center text-lg font-bold">
          T-1Project
        </Link>
        <nav className="flex flex-wrap items-center gap-3">
          {user ? (
            <>
              {MENU.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className="flex min-h-[44px] items-center px-2 text-[17px] underline-offset-8 aria-[current=page]:underline"
                >
                  {label}
                </NavLink>
              ))}
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  logout()
                  navigate('/')
                }}
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-sm btn-secondary">
                로그인
              </Link>
              <Link to="/signup" className="btn btn-sm btn-secondary">
                가입하기
              </Link>
            </>
          )}
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
