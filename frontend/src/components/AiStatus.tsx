import { ErrorView } from '@/components/States'

/** AI를 부르는 동안 보여 주는 글자. */
export function AiProgress() {
  return (
    <p role="status" className="dots text-[15px]">
      AI가 생각하는 중이에요
    </p>
  )
}

/** AI 호출 상태 표시: 진행 중이면 진행 글자, 502면 실패 안내와 `다시 시도`, 그 밖의 오류는 안내만. */
export function AiStatus({
  busy,
  failed,
  error,
  onRetry,
}: {
  busy: boolean
  failed: boolean
  error?: string | null
  onRetry: () => void
}) {
  if (busy) return <AiProgress />
  if (failed) {
    return <ErrorView message="AI 호출에 실패했어요. 다시 시도해 주세요." onRetry={onRetry} />
  }
  if (error) return <ErrorView message={error} />
  return null
}
