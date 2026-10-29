import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@/api/client'

type LoadState<T> = {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
  setData: (data: T) => void
}

/** 화면에 필요한 데이터를 불러온다. deps가 바뀌면 다시 불러온다. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): LoadState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    load()
      .then((value) => alive && setData(value))
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', '불러오지 못했어요.'))
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload, setData }
}
