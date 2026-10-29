import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, clearToken, getToken } from '@/api/client'
import type { User } from '@/api/types'
import { AuthContext } from '@/auth/context'

// 토큰은 localStorage에 있고, 새로고침하면 /api/auth/me로 로그인 상태를 확인한다.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(() => !getToken())

  useEffect(() => {
    if (!getToken()) return
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => {
        clearToken()
        setUser(null)
      })
      .finally(() => setReady(true))
  }, [])

  // 로그아웃은 별도 API 없이 토큰을 버리는 것으로 끝난다.
  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, ready, setUser, logout }}>{children}</AuthContext.Provider>
  )
}
