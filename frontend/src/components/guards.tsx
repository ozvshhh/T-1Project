import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuth } from '@/auth/context'
import { ErrorView, Loading } from '@/components/States'
import { isUnlocked } from '@/lib/cards'
import { useLoad } from '@/lib/useLoad'

/** 로그인 보호: 로그인하지 않았으면 /login으로 보내고, 로그인하면 원래 주소로 돌아오게 from을 남긴다. */
export function RequireAuth() {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <Loading />
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/** 자소서 잠금: 확정 카드가 하나도 없으면 /cover-letters로 보낸다. 거기서 잠금 안내가 보인다. */
export function RequireUnlocked() {
  const { data, error, loading, reload } = useLoad(() => api.listExperiences())
  if (loading) return <Loading />
  if (error) return <ErrorView message={error.message} onRetry={reload} />
  if (!data || !isUnlocked(data.experiences)) return <Navigate to="/cover-letters" replace />
  return <Outlet />
}
