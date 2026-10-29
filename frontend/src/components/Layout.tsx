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
      <header className="border-line border-b">
        <div className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">
          <Link to="/" className="flex min-h-[44px] items-center text-[17px] font-bold">
            T-1Project
          </Link>
          <nav className="flex flex-wrap items-center gap-5">
            {user ? (
              <>
                {MENU.map(({ to, label }) => (
                  // 지금 화면의 메뉴는 글자 아래 검정 2px 선(와이어프레임 .nav .on).
                  <NavLink
                    key={to}
                    to={to}
                    className="group focus-visible:outline-ink flex min-h-[44px] items-center text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="group-hover:border-line group-aria-[current=page]:border-ink border-b-2 border-transparent transition-[border-color] duration-150">
                      {label}
                    </span>
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
        </div>
      </header>
      <Outlet />
    </div>
  )
}
