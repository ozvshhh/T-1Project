import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { setToken } from '@/api/client'
import { AuthProvider } from '@/auth/AuthProvider'
import { getDb, tokenFor } from '@/mocks/db'
import ExperienceNew from '@/pages/ExperienceNew'
import { renderApp } from '@/test/render'

function Probe() {
  return <p>이동: {useLocation().pathname}</p>
}

describe('경험 목록', () => {
  it('시드 경험 두 개와 항목 칸이 보인다', async () => {
    renderApp('/experiences', { loggedIn: true })
    expect(await screen.findByText('캡스톤디자인 학과 공지 알림 앱')).toBeInTheDocument()
    expect(screen.getByText('교내 해커톤 동아리 회비 정산 웹')).toBeInTheDocument()
    expect(screen.getAllByText('상황')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '경험 추가' })).toHaveAttribute(
      'href',
      '/experiences/new',
    )
  })
})

describe('경험 등록', () => {
  it('단서 없이 제목·시기를 넣고 대화 시작을 누르면 경험 상세로 간다', async () => {
    renderApp('/experiences/new', { loggedIn: true })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('제목'), '새 경험')
    await user.type(screen.getByLabelText('대략적 시기'), '2025년 가을')
    await user.click(screen.getByRole('button', { name: '대화 시작' }))
    expect(await screen.findByRole('heading', { name: '새 경험' })).toBeInTheDocument()
    expect(screen.queryByText('없는 페이지예요')).not.toBeInTheDocument()
  })

  it('글 단서를 올리고 경험 상세 주소로 간다', async () => {
    setToken(tokenFor(getDb().users[0].id))
    render(
      <MemoryRouter initialEntries={['/experiences/new']}>
        <AuthProvider>
          <Routes>
            <Route path="/experiences/new" element={<ExperienceNew />} />
            <Route path="/experiences/:id" element={<Probe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('제목'), '단서 경험')
    await user.type(screen.getByLabelText('대략적 시기'), '2025년 여름')
    await user.click(screen.getByRole('button', { name: '글로 추가' }))
    await user.type(screen.getByLabelText('단서 내용'), '발표 자료를 만들었다')
    await user.click(screen.getByRole('button', { name: '대화 시작' }))
    expect(await screen.findByText(/이동: \/experiences\/.+/)).toBeInTheDocument()
    expect(getDb().experiences.some((e) => e.title === '단서 경험' && e.clues.length === 1)).toBe(
      true,
    )
  })

  it('제목을 비우면 필수 입력이에요가 보이고 이동하지 않는다', async () => {
    renderApp('/experiences/new', { loggedIn: true })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('대략적 시기'), '2025년')
    await user.click(screen.getByRole('button', { name: '대화 시작' }))
    expect(await screen.findByText('필수 입력이에요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '대화 시작' })).toBeInTheDocument()
  })
})
