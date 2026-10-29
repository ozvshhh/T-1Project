import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { useAuth } from '@/auth/context'
import { StageBlock } from '@/components/StageBlock'

type Mode = 'signup' | 'login'

const COPY = {
  signup: {
    title: '가입하기',
    submit: '가입하기',
    switchText: '이미 계정이 있나요?',
    switchLink: '로그인',
    switchTo: '/login',
  },
  login: {
    title: '로그인',
    submit: '로그인',
    switchText: '처음이신가요?',
    switchLink: '가입하기',
    switchTo: '/signup',
  },
} as const

export default function AuthPage({ mode }: { mode: Mode }) {
  const copy = COPY[mode]
  const { user, setUser } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 로그인 상태면(가입·로그인 직후 포함) 원래 가려던 곳으로, 없으면 자소서 목록으로.
  if (user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/cover-letters'} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res =
        mode === 'signup' ? await api.signup(email, password) : await api.login(email, password)
      setUser(res.user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
      setBusy(false)
    }
  }

  return (
    <main className="wrap grid gap-4 pt-12 md:grid-cols-[1fr_minmax(360px,480px)]">
      <StageBlock stage="experience" className="justify-between md:min-h-[480px]">
        <p className="label">계정</p>
        <h1 className="h1">{copy.title}</h1>
      </StageBlock>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 self-center py-6">
        <div>
          <label htmlFor="email" className="label mb-2 block">
            이메일
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="label mb-2 block">
            비밀번호
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {copy.submit}
        </button>
        <p className="text-[15px]">
          {copy.switchText}{' '}
          <Link to={copy.switchTo} state={location.state} className="underline underline-offset-4">
            {copy.switchLink}
          </Link>
        </p>
      </form>
    </main>
  )
}
