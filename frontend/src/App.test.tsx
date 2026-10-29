import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'

describe('App routing', () => {
  it('홈 화면을 보여준다', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'T-1Project' })).toBeInTheDocument()
  })

  it('없는 경로에서 404 화면을 보여준다', () => {
    render(
      <MemoryRouter initialEntries={['/nope']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByText('페이지를 찾을 수 없어요')).toBeInTheDocument()
  })
})
