import type {
  CoverLetter,
  CoverLetterSummary,
  InterviewSession,
  InterviewSummary,
  NextAction,
  Result,
  Resume,
  ResumeTemplateItem,
  Suggestion,
  User,
} from '@/api/types'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// 주소는 항상 상대 경로. 세션은 HttpOnly 쿠키라 토큰을 따로 다루지 않는다.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError(0, 'NETWORK', '서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  }
  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const error = data?.error
    throw new ApiError(
      res.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? '요청을 처리하지 못했어요.',
    )
  }
  return data as T
}

export type ResumeInput = { key: string; content: string }[]
export type AnswerInput = {
  questionId: string
  text: string
  inputMode: 'voice' | 'text'
  transcriptRaw?: string
}
type InterviewStep = { interview: InterviewSession; next: NextAction }

export const api = {
  signup: (email: string, password: string) =>
    request<{ user: User }>('POST', '/auth/signup', { email, password }),
  login: (email: string, password: string) =>
    request<{ user: User }>('POST', '/auth/login', { email, password }),
  logout: () => request<void>('POST', '/auth/logout'),
  me: () => request<{ user: User }>('GET', '/auth/me'),

  resumeTemplate: () => request<{ items: ResumeTemplateItem[] }>('GET', '/resume/template'),
  getResume: () => request<{ resume: Resume | null }>('GET', '/resume'),
  saveResume: (items: ResumeInput) => request<{ resume: Resume }>('PUT', '/resume', { items }),

  listCoverLetters: () => request<{ coverLetters: CoverLetterSummary[] }>('GET', '/cover-letters'),
  getCoverLetter: (id: string) =>
    request<{ coverLetter: CoverLetter }>('GET', `/cover-letters/${id}`),
  createCoverLetter: (input: { title?: string; body: string }) =>
    request<{ coverLetter: CoverLetter }>('POST', '/cover-letters', input),
  generateCoverLetter: () =>
    request<{ coverLetter: CoverLetter }>('POST', '/cover-letters/generate', {}),

  listInterviews: () => request<{ interviews: InterviewSummary[] }>('GET', '/interviews'),
  startInterview: (coverLetterId: string) =>
    request<{ interview: InterviewSession }>('POST', '/interviews', { coverLetterId }),
  getInterview: (id: string) =>
    request<{ interview: InterviewSession }>('GET', `/interviews/${id}`),
  answer: (id: string, input: AnswerInput) =>
    request<InterviewStep>('POST', `/interviews/${id}/answers`, input),
  skip: (id: string, questionId: string) =>
    request<InterviewStep>('POST', `/interviews/${id}/skip`, { questionId }),
  end: (id: string) =>
    request<{ interview: InterviewSession; result: Result }>('POST', `/interviews/${id}/end`),
  getResult: (id: string) => request<{ result: Result }>('GET', `/interviews/${id}/result`),
  acceptSuggestion: (id: string, sid: string) =>
    request<{ suggestion: Suggestion; coverLetter: CoverLetter }>(
      'POST',
      `/interviews/${id}/suggestions/${sid}/accept`,
    ),
  rejectSuggestion: (id: string, sid: string) =>
    request<{ suggestion: Suggestion }>('POST', `/interviews/${id}/suggestions/${sid}/reject`),

  transcribe: (interviewId: string, audio: Blob) => {
    const form = new FormData()
    form.append('audio', audio, 'answer.webm')
    form.append('interviewId', interviewId)
    return request<{ text: string }>('POST', '/speech/transcribe', form)
  },
  // TTS는 audio/mpeg라 JSON 요청 함수를 쓰지 않는다.
  tts: async (interviewId: string, questionId: string) => {
    const params = new URLSearchParams({ interviewId, questionId })
    const res = await fetch(`/api/speech/tts?${params}`, { credentials: 'same-origin' })
    if (!res.ok) throw new ApiError(res.status, 'AI_UNAVAILABLE', '질문 음성을 만들지 못했어요.')
    return res.blob()
  },
}
