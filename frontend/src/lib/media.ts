import { useCallback, useEffect, useRef, useState } from 'react'

/** 카메라 미리보기(F9). 저장·전송하지 않는다. 실패하면 stream이 null로 남고 화면은 검게 둔다. */
export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    let active: MediaStream | null = null
    let alive = true
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop())
        active = s
        setStream(s)
      })
      .catch(() => undefined)
    return () => {
      alive = false
      active?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return stream
}

/** 마이크 녹음(F6). stop()이 녹음된 오디오를 돌려준다. */
export function useRecorder() {
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const [recording, setRecording] = useState(false)

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('이 브라우저에서는 녹음할 수 없어요. 글자로 답해 주세요.')
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      throw new Error('마이크를 쓸 수 없어요. 권한을 확인하거나 글자로 답해 주세요.')
    }
    chunks.current = []
    const r = new MediaRecorder(stream)
    r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data)
    r.start()
    recorder.current = r
    setRecording(true)
  }, [])

  const stop = useCallback(
    () =>
      new Promise<Blob>((resolve) => {
        const r = recorder.current
        if (!r) return resolve(new Blob())
        r.onstop = () => {
          r.stream.getTracks().forEach((t) => t.stop())
          recorder.current = null
          setRecording(false)
          resolve(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }))
        }
        r.stop()
      }),
    [],
  )

  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  return { recording, start, stop }
}

/** 카메라·마이크를 쓸 수 있는지 한 번 확인한다(면접 시작 전 준비 화면). */
export async function checkDevices() {
  const check = async (constraints: MediaStreamConstraints) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints)
      s.getTracks().forEach((t) => t.stop())
      return true
    } catch {
      return false
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) return { camera: false, mic: false }
  return { camera: await check({ video: true }), mic: await check({ audio: true }) }
}
