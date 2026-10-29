import { screen } from '@testing-library/react'
import { renderApp } from '@/test/render'

describe('App routing', () => {
  it('없는 주소에서 안내와 홈으로 버튼을 보여준다', () => {
    renderApp('/nope')
    expect(screen.getByText('없는 페이지예요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '홈으로' })).toBeInTheDocument()
  })
})
