import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { CoverLetter } from '@/api/types'
import { ErrorView, Loading } from '@/components/States'
import { StageBlock } from '@/components/StageBlock'
import { isUnlocked } from '@/lib/cards'
import { formatDate } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'

function LetterRow({ letter }: { letter: CoverLetter }) {
  const generated = letter.kind === 'generated'
  const answered = letter.items.filter((item) => item.answer).length
  return (
    <li>
      <Link to={`/cover-letters/${letter.id}`} className="row rounded-row grid gap-1 p-4">
        <span className="card-title">{letter.title || '제목 없음'}</span>
        <span className="meta">
          {generated ? '작성함' : '붙여넣음'}
          {generated && ` · 응답 ${answered} / 문항 ${letter.items.length}`}
        </span>
        <span className="meta">{formatDate(letter.updatedAt)}</span>
      </Link>
    </li>
  )
}

export default function Home() {
  const { data, error, loading, reload } = useLoad(async () => {
    const { experiences } = await api.listExperiences()
    if (!isUnlocked(experiences)) return { experiences, letters: [] as CoverLetter[] }
    const { coverLetters } = await api.listCoverLetters()
    return { experiences, letters: coverLetters }
  })

  if (loading) {
    return (
      <main className="wrap">
        <Loading />
      </main>
    )
  }
  if (error || !data) {
    return (
      <main className="wrap pt-12">
        <ErrorView message={error?.message ?? '불러오지 못했어요.'} onRetry={reload} />
      </main>
    )
  }

  if (!isUnlocked(data.experiences)) {
    return (
      <main className="wrap pt-12">
        <StageBlock stage="experience">
          <p className="h2">경험 카드를 먼저 하나 확정해야 자소서를 쓰고 점검할 수 있어요.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/resume" className="btn btn-primary">
              이력서 입력
            </Link>
            {data.experiences.length > 0 && (
              <Link to="/experiences" className="btn btn-secondary">
                경험 카드 확정하러 가기
              </Link>
            )}
          </div>
        </StageBlock>
      </main>
    )
  }

  return (
    <main className="wrap grid gap-4 pt-12">
      <StageBlock stage="coverLetter">
        <div className="flex flex-wrap gap-3">
          <Link to="/cover-letters/new" className="btn btn-primary">
            새로 쓰기
          </Link>
          <Link to="/cover-letters/paste" className="btn btn-secondary">
            쓴 자소서 붙여넣기
          </Link>
        </div>
      </StageBlock>
      {data.letters.length === 0 ? (
        <div className="row-pending rounded-row p-6">
          <p className="text-[15px]">아직 자소서가 없어요</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {data.letters.map((letter) => (
            <LetterRow key={letter.id} letter={letter} />
          ))}
        </ul>
      )}
    </main>
  )
}
