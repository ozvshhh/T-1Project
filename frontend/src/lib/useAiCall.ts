import { useCallback, useRef, useState } from 'react'
import { ApiError } from '@/api/client'

/**
 * AI를 부르는 요청을 감싼다. 진행 중에는 busy, `502 AI_UNAVAILABLE`이면 failed.
 * retry는 마지막과 똑같은 요청을 다시 보낸다. 입력한 글은 이 훅이 건드리지 않으니 입력칸에 그대로 남는다.
 */
export function useAiCall() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const last = useRef<(() => Promise<void>) | null>(null)

  const run = useCallback(async function run<T>(
    call: () => Promise<T>,
    onDone?: (result: T) => void,
  ): Promise<void> {
    last.current = () => run(call, onDone)
    setBusy(true)
    setFailed(false)
    setError(null)
    try {
      // `onDone?.(await call())`로 쓰면 onDone이 없을 때 call이 아예 실행되지 않는다.
      const result = await call()
      onDone?.(result)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AI_UNAVAILABLE') setFailed(true)
      else setError(e instanceof ApiError ? e.message : '요청을 처리하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }, [])

  const retry = useCallback(() => {
    void last.current?.()
  }, [])

  return { busy, failed, error, run, retry }
}
