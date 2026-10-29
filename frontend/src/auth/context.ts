import { createContext, useContext } from 'react'
import type { User } from '@/api/types'

export type AuthState = {
  user: User | null
  /** /api/auth/me 확인이 끝났는지 */
  ready: boolean
  setUser: (user: User | null) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider 안에서만 쓸 수 있어요.')
  return ctx
}
