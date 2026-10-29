import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/api/client'
import type { User } from '@/api/types'
import { AuthContext } from '@/auth/context'

// 로그인 여부만 알려 준다. 로그인 전 화면 막기(가드)는 공통 기획이 나오면 붙인다.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true))
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, ready, setUser, logout }}>{children}</AuthContext.Provider>
  )
}
