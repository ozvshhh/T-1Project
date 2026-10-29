import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { Experience } from '@/api/types'
import { Empty, ErrorView, Loading } from '@/components/States'
import { StageBlock } from '@/components/StageBlock'
import { ITEM_LABELS, ITEM_ORDER } from '@/lib/cards'
import { useLoad } from '@/lib/useLoad'

function ExperienceRow({ experience }: { experience: Experience }) {
  const pending = experience.candidates.length
  return (
    <li className="row rounded-row grid gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link to={`/experiences/${experience.id}`} className="card-title">
          {experience.title}
        </Link>
        <span className="meta">{experience.period}</span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {ITEM_ORDER.map((item) => (
          <li
            key={item}
            className={`${experience.card[item].length > 0 ? 'row' : 'row-pending'} rounded-row px-3 py-1 text-[14px]`}
          >
            {ITEM_LABELS[item]}
          </li>
        ))}
      </ul>
      {pending > 0 && <span className="meta">확인 대기 {pending}</span>}
    </li>
  )
}

export default function Experiences() {
  const { data, error, loading, reload } = useLoad(async () => {
    const { experiences } = await api.listExperiences()
    return experiences
  })

  return (
    <main className="wrap grid gap-4 pt-12">
      <StageBlock stage="experience">
        <h1 className="h2">경험</h1>
        <div>
          <Link to="/resume" className="btn btn-primary">
            이력서에서 활동 추가
          </Link>
        </div>
      </StageBlock>
      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorView message={error?.message ?? '불러오지 못했어요.'} onRetry={reload} />
      ) : data.length === 0 ? (
        <Empty text="아직 경험이 없어요" to="/resume" action="이력서 입력" />
      ) : (
        <ul className="grid gap-3">
          {data.map((experience) => (
            <ExperienceRow key={experience.id} experience={experience} />
          ))}
        </ul>
      )}
    </main>
  )
}
