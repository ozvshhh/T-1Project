import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '@/test/render'

describe('G 붙여넣기', () => {
  it('S3: 빈 본문은 저장되지 않고, 입력 후 저장하면 목록에 붙여넣음이 늘어난다', async () => {
    const user = userEvent.setup()
    renderApp('/cover-letters', { loggedIn: true })
    await user.click(await screen.findByRole('link', { name: '쓴 자소서 붙여넣기' }))
    await user.click(await screen.findByRole('button', { name: '저장' }))
    expect(screen.getByText('본문을 입력해 주세요.')).toBeInTheDocument()
    await user.type(
      screen.getByLabelText('본문'),
      '저는 동아리 회비 정산 웹을 만들며 입금 내역을 엑셀로 받아 화면에 올리는 기능을 맡았습니다.',
    )
    await user.click(screen.getByRole('button', { name: '저장' }))
    await user.click(await screen.findByRole('link', { name: '자소서' }))
    expect(await screen.findAllByText(/붙여넣음/)).toHaveLength(2)
  })

  it('확정 카드가 없는 계정은 붙여넣기 대신 홈 잠금 안내가 보인다', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getAllByRole('link', { name: '가입하기' })[0])
    await user.type(screen.getByLabelText('이메일'), 'locked@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'lockedpassword1')
    await user.click(screen.getByRole('button', { name: '가입하기' }))
    await screen.findByText('경험 카드를 먼저 하나 확정해야 자소서를 쓰고 점검할 수 있어요.')
  })
})
