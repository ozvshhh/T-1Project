// docs/api.md 응답 형태. 서버 명세가 바뀌면 이 파일부터 고친다.

export type User = { id: string; email: string; role: string; createdAt: string }

export type ResumeTemplateItem = { key: string; label: string }
export type ResumeItem = { key: string; label: string; content: string }
export type Resume = { id: string; items: ResumeItem[]; updatedAt: string }

export type CoverLetterSource = 'generated' | 'uploaded'
export type CoverLetterSummary = {
  id: string
  title: string
  source: CoverLetterSource
  createdAt: string
  updatedAt: string
}
export type CoverLetter = CoverLetterSummary & {
  body: string
  resumeSnapshot: { items: ResumeItem[] } | null
}

export type Interviewer = 'practical' | 'executive'
export type EndReason = 'user_end' | 'question_limit' | 'time_limit' | 'all_done'
export type CheckState = 'explained' | 'needs_more' | 'unknown'

export type MainQuestion = {
  id: string
  interviewer: Interviewer
  order: number
  purpose: string
  basisSentence: string
  text: string
}

export type Question = {
  id: string
  kind: 'main' | 'follow_up'
  mainQuestionId: string
  interviewer: Interviewer
  interviewerLabel: string
  purpose: string
  text: string
  askedAt: string
}

export type Answer = {
  id: string
  text: string
  inputMode: 'voice' | 'text'
  transcriptRaw?: string
  answeredAt: string
}

export type Turn = {
  question: Question
  answer: Answer | null
  skipped: boolean
  checkState: CheckState | null
}

export type InterviewSession = {
  id: string
  coverLetterId: string
  coverLetterSnapshot: { title: string; body: string }
  status: 'in_progress' | 'finished'
  startedAt: string
  finishedAt: string | null
  endReason: EndReason | null
  usedFallbackQuestions: boolean
  limits: { maxQuestions: number; maxMinutes: number; maxFollowUpsPerMain: number }
  mainQuestions: MainQuestion[]
  turns: Turn[]
  currentQuestion: Question | null
}

export type InterviewSummary = {
  id: string
  coverLetterTitle: string
  status: 'in_progress' | 'finished'
  startedAt: string
  finishedAt: string | null
  endReason: EndReason | null
}

export type NextAction = { action: 'follow_up' | 'next_main' | 'finished'; reason?: string }

export type Suggestion = {
  id: string
  original: string
  proposed: string
  why: string
  status: 'pending' | 'accepted' | 'rejected'
}

export type Result = {
  interviewId: string
  transcript: Turn[]
  clarifiedExperiences: {
    field: 'role' | 'reason' | 'result'
    text: string
    basisAnswerId: string
  }[]
  openItems: { text: string; basisQuestionId: string }[]
  suggestions: Suggestion[]
  resultStatus?: 'complete' | 'partial'
}
