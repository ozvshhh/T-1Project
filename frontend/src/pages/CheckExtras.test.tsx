import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, setToken } from '@/api/client'
import { getDb, tokenFor } from '@/mocks/db'
import { renderApp } from '@/test/render'

const AI_WAIT = { timeout: 4000 }
const S6_ANSWER = '실제로 재지는 않았고, 공지를 놓쳤다는 말이 줄었다는 반응만 들었습니다.'

async function seedCheck() {
  setToken(tokenFor(getDb().users[0].id))
  const { check } = await api.createCheck(getDb().coverLetters[0].id)
  return check
}

async function answerFirst(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/어떤 데이터를 어떤 도구로/, {}, AI_WAIT)
  await user.type(screen.getByLabelText('답변'), S6_ANSWER)
  await user.click(screen.getByRole('button', { name: '답하기' }))
  await screen.findByRole('button', { name: '자소서에서 고치기' }, AI_WAIT)
}

describe('K 제출 전 점검 — 고치기·경험 대화·사실 후보', () => {
  it('모름·경험 없음으로 끝난 문장에 두 버튼이 보이고, 붙여넣음은 자소서 상세로 간다', async () => {
    const user = userEvent.setup()
    const check = await seedCheck()
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    await answerFirst(user)
    expect(screen.getByRole('button', { name: '관련 경험 대화 이어가기' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '자소서에서 고치기' }))
    expect(await screen.findByRole('button', { name: '제출 전 점검 시작' })).toBeInTheDocument()
  }, 15000)

  it('붙여넣음이면 경험 목록에서 골라 경험 상세로 간다', async () => {
    const user = userEvent.setup()
    const check = await seedCheck()
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    await answerFirst(user)
    await user.click(screen.getByRole('button', { name: '관련 경험 대화 이어가기' }))
    const list = await screen.findByRole('list', { name: '관련 경험 목록' })
    const target = getDb().experiences[1]
    await user.click(within(list).getByRole('button', { name: target.title }))
    expect(await screen.findByRole('heading', { name: target.title })).toBeInTheDocument()
  }, 15000)

  it('사실 후보가 AI 제안·미확인으로 보이고, 카드에 저장하면 경험 카드에 들어간다', async () => {
    const user = userEvent.setup()
    const check = await seedCheck()
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    await answerFirst(user)
    expect(screen.getByRole('heading', { name: '카드에 넣을 사실' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: '카드에 넣을 사실 목록' })
    expect(within(list).getByText('AI 제안·미확인')).toBeInTheDocument()
    const experienceId = getDb().checks[0].candidates[0].experienceId
    const before = getDb().experiences.flatMap((e) => Object.values(e.card).flat()).length

    await user.click(within(list).getByRole('button', { name: '카드에 저장' }))
    expect(within(list).getByLabelText('경험')).toHaveValue(experienceId ?? '')
    await user.click(within(list).getByRole('radio', { name: '내가 말함' }))
    await user.click(within(list).getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '카드에 넣을 사실' })).not.toBeInTheDocument(),
    )
    const after = getDb().experiences.flatMap((e) => Object.values(e.card).flat())
    expect(after).toHaveLength(before + 1)
    expect(after.some((f) => f.text === S6_ANSWER && f.origin === 'check')).toBe(true)
  }, 15000)

  it('버리기를 누르면 후보가 사라진다', async () => {
    const user = userEvent.setup()
    const check = await seedCheck()
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    await answerFirst(user)
    await user.click(screen.getByRole('button', { name: '버리기' }))
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '카드에 넣을 사실' })).not.toBeInTheDocument(),
    )
    expect(getDb().checks[0].candidates).toHaveLength(0)
  }, 15000)
})
