import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getToken } from '@/api/client'
import { renderApp } from '@/test/render'

describe('소개·가입·로그인', () => {
  it('소개 화면에 가입하기·로그인 링크가 있다', () => {
    renderApp('/')
    expect(screen.getByText('1 경험 꺼내기')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '가입하기' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: '로그인' }).length).toBeGreaterThan(0)
  })

  it('가입하면 홈으로 가고 토큰이 저장된다', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(screen.getByLabelText('이메일'), 'new@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'newpassword1')
    await user.click(screen.getByRole('button', { name: '가입하기' }))
    await waitFor(() => expect(getToken()).toBeTruthy())
    expect(await screen.findByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })

  it('이미 있는 이메일로 가입하면 안내가 보인다', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(screen.getByLabelText('이메일'), 'seeker@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'whatever1234')
    await user.click(screen.getByRole('button', { name: '가입하기' }))
    expect(await screen.findByText('이미 가입된 이메일이에요.')).toBeInTheDocument()
  })

  it('틀린 비밀번호로 로그인하면 안내가 보인다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(screen.getByLabelText('이메일'), 'seeker@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findByText('이메일 또는 비밀번호가 맞지 않아요.')).toBeInTheDocument()
  })

  it('로그인 상태로 /에 오면 /cover-letters로 간다', async () => {
    renderApp('/', { loggedIn: true })
    // 홈 화면은 8번에서 만들어서, 지금은 소개가 사라지는 것으로 확인한다.
    await waitFor(() => expect(screen.queryByText('1 경험 꺼내기')).not.toBeInTheDocument())
  })
})
