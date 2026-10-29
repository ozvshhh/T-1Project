import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/context'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen pb-16">
      <header className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
        <Link to="/" className="flex min-h-[44px] items-center text-lg font-bold">
          T-1Project
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-[15px]">{user.email}</span>
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
