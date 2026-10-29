import { screen } from '@testing-library/react'
import { renderApp } from '@/test/render'

describe('App routing', () => {
  it('홈 화면을 보여준다', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'T-1Project' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '회원가입' })).toBeInTheDocument()
  })

  it('없는 경로에서 404 화면을 보여준다', () => {
    renderApp('/nope')
    expect(screen.getByText('페이지를 찾을 수 없어요')).toBeInTheDocument()
  })
})
