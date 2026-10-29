import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getDb } from '@/mocks/db'
import { renderApp } from '@/test/render'

// docs/scenarios.yaml S1~S6을 목 API로 따라간다. 화면 글자는 시나리오와 같아야 한다.

describe('S1 회원가입', () => {
  it('가입하면 내 이력서가 열리고 위쪽에 이메일이 보인다', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(await screen.findByRole('link', { name: '회원가입' }))
    await user.type(screen.getByLabelText('이메일'), 'new@t1.test')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect(await screen.findByRole('heading', { name: '내 이력서' })).toBeInTheDocument()
    expect(screen.getByText('new@t1.test')).toBeInTheDocument()
  })

  it('이미 가입된 이메일이면 이유를 보여 주고 입력값을 유지한다', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(screen.getByLabelText('이메일'), 'seed@t1.test')
    await user.type(screen.getByLabelText('비밀번호'), 'password123')
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 가입된 이메일')
    expect(screen.getByLabelText('이메일')).toHaveValue('seed@t1.test')
  })
})

describe('S2 내 이력서', () => {
  it('항목을 골라 채우고 저장하면 서버에 저장된다', async () => {
    const user = userEvent.setup()
    getDb().resumes = {}
    renderApp('/resume', { loggedIn: true })

    const picker = await screen.findByRole('group', { name: '항목 고르기' })
    await user.click(within(picker).getByRole('checkbox', { name: '직무 관련 성공경험' }))
    await user.click(within(picker).getByRole('checkbox', { name: '팀워크 및 협업경험' }))
    await user.type(
      screen.getByRole('textbox', { name: '직무 관련 성공경험' }),
      '동아리 웹사이트 로그인 오류를 찾아 고쳤다',
    )
    await user.type(
      screen.getByRole('textbox', { name: '팀워크 및 협업경험' }),
      '해커톤에서 4명과 역할을 나눠 48시간 안에 완성했다',
    )
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('저장 완료')).toBeInTheDocument()
    const saved = Object.values(getDb().resumes)[0]
    expect(saved.items.map((i) => i.key)).toEqual(['job_success', 'teamwork'])
    expect(saved.items[1].content).toBe('해커톤에서 4명과 역할을 나눠 48시간 안에 완성했다')
  })

  it('칸을 비운 채 저장하면 경고가 보이고 저장되지 않는다', async () => {
    const user = userEvent.setup()
    getDb().resumes = {}
    renderApp('/resume', { loggedIn: true })

    const picker = await screen.findByRole('group', { name: '항목 고르기' })
    await user.click(within(picker).getByRole('checkbox', { name: '지원동기' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("'지원동기' 칸이 비어 있어요")
    expect(getDb().resumes).toEqual({})
  })
})

describe('S4 자기소개서 등록', () => {
  it('붙여 넣고 저장하면 목록에 보이고 본문이 그대로다', async () => {
    const user = userEvent.setup()
    renderApp('/cover-letters', { loggedIn: true })
    await user.click(await screen.findByRole('link', { name: '자기소개서 등록' }))
    const body = '저는 동아리 웹사이트의 로그인 오류를 직접 찾아 고친 경험이 있습니다.'
    await user.type(screen.getByLabelText('본문'), body)
    await user.click(screen.getByRole('button', { name: '저장' }))

    const list = await screen.findByRole('region', { name: '자기소개서 목록' })
    expect(within(list).getAllByRole('button')).toHaveLength(2)
    const preview = await screen.findByRole('article', { name: '자기소개서 미리보기' })
    expect(await within(preview).findByText(body)).toBeInTheDocument()
  })

  it('본문이 비어 있으면 저장하지 않고 이유를 보여 준다', async () => {
    const user = userEvent.setup()
    renderApp('/cover-letters/new', { loggedIn: true })
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(screen.getByRole('alert')).toHaveTextContent('본문이 비어 있어요')
    expect(getDb().coverLetters).toHaveLength(1)
  })
})

describe('S5 모의면접', () => {
  it('글자로 답하고 종료하면 결과에 답변과 사용자 종료가 보인다', async () => {
    const user = userEvent.setup()
    renderApp('/interview', { loggedIn: true })
    await user.click(await screen.findByRole('radio', { name: /시드 자기소개서/ }))
    await user.click(screen.getByRole('button', { name: '면접 시작' }))

    await user.click(await screen.findByRole('button', { name: '글자로 답하기' }))
    const answer = '제가 로그인 오류의 원인을 로그에서 찾아 세션 만료 처리를 고쳤습니다.'
    await user.type(screen.getByRole('textbox', { name: '답변' }), answer)
    await user.click(screen.getByRole('button', { name: '답변 제출' }))
    expect(await screen.findByText('꼬리질문')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '면접 종료' }))
    const record = await screen.findByRole('region', { name: /질문·답변 기록/ })
    expect(within(record).getByText(answer)).toBeInTheDocument()
    expect(screen.getByText('사용자 종료')).toBeInTheDocument()
    expect(screen.queryByText(/점수/)).not.toBeInTheDocument()
  })
})

describe('S6 수정 제안 승인', () => {
  it('승인하면 반영됨으로 바뀌고 자기소개서 본문이 바뀐다', async () => {
    const user = userEvent.setup()
    renderApp('/interviews', { loggedIn: true })
    await user.click(await screen.findByRole('link', { name: /시드 자기소개서/ }))
    await screen.findByRole('heading', { name: /자기소개서 수정 제안/ })
    await user.click(screen.getByRole('button', { name: '승인' }))

    expect(await screen.findByText('반영됨')).toBeInTheDocument()
    const suggestion = getDb().interviews[0].result!.suggestions[0]
    expect(getDb().coverLetters[0].body).toContain(suggestion.proposed)
  })
})
